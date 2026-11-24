/**
 * Downloads MZK Zielona Góra's GTFS feed and turns it into small static JSON
 * files served by the Worker as Static Assets (see wrangler.jsonc "assets").
 *
 *   node scripts/gtfs/build.ts                  # download from MZK
 *   node scripts/gtfs/build.ts --zip feed.zip   # use a local file
 *   node scripts/gtfs/build.ts --out public     # output root (default: public)
 *
 * Requires Node >= 23.6 (runs TypeScript natively).
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { unzipSync } from "fflate";
import {
	GTFS_PATHS,
	type GtfsCalendarDay,
	type GtfsDeparture,
	type GtfsLine,
	type GtfsLineDetails,
	type GtfsLineVariant,
	type GtfsMeta,
	type GtfsShape,
	type GtfsStop,
	type GtfsTrip,
	type GtfsTripBucket,
} from "../../src/providers/zielona-gora/gtfs/files.ts";
import { parseCsv } from "./csv.ts";

const SOURCE_URL =
	"https://www.mzk.zgora.pl/storage/website/dla_deweloperow_gdttq.zip";

const { values: args } = parseArgs({
	options: {
		zip: { type: "string" },
		out: { type: "string", default: "public" },
	},
});

// ---------- load ----------

type Source = {
	files: Record<string, Uint8Array>;
	etag: string | null;
	lastModified: string | null;
};

const loadSource = async (): Promise<Source> => {
	if (args.zip) {
		return {
			files: unzipSync(await readFile(args.zip)),
			etag: null,
			lastModified: null,
		};
	}
	const res = await fetch(SOURCE_URL, {
		headers: { "User-Agent": "poland-public-transport-api GTFS builder" },
	});
	if (!res.ok) throw new Error(`GTFS download failed: ${res.status}`);
	return {
		files: unzipSync(new Uint8Array(await res.arrayBuffer())),
		etag: res.headers.get("etag"),
		lastModified: res.headers.get("last-modified"),
	};
};

const source = await loadSource();
const decoder = new TextDecoder("utf-8");
const table = (name: string) => {
	const file = source.files[name];
	if (!file) throw new Error(`${name} missing in GTFS zip`);
	return parseCsv(decoder.decode(file));
};

const agency = table("agency.txt");
const feedInfo = table("feed_info.txt");
const stops = table("stops.txt");
const routes = table("routes.txt");
const trips = table("trips.txt");
const stopTimes = table("stop_times.txt");
const calendar = source.files["calendar.txt"] ? table("calendar.txt") : [];
const calendarDates = source.files["calendar_dates.txt"]
	? table("calendar_dates.txt")
	: [];
const shapes = source.files["shapes.txt"] ? table("shapes.txt") : [];

// ---------- helpers ----------

const isoDate = (yyyymmdd: string) =>
	`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

/** "18:39:00" → "18:39" */
const hhmm = (time: string) => time.trim().slice(0, 5).padStart(5, "0");

/** MZK service ids look like "<timetableVersion>_<dayType>", e.g. "7387_RO". */
const splitServiceId = (serviceId: string) => {
	const [version = serviceId, dayType = ""] = serviceId.split("_");
	return { version, dayType };
};

/** MZK trip ids are "<timetableVersion>_<courseId>"; courseId matches the live API. */
const courseIdOf = (tripId: string) => Number(tripId.split("_").at(-1));

const naturalCompare = (a: string, b: string) =>
	a.localeCompare(b, "pl", { numeric: true });

// ---------- calendar ----------

const WEEKDAYS = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
] as const;

const servicesByDate = new Map<string, Set<string>>();
const addService = (date: string, serviceId: string) => {
	const set = servicesByDate.get(date) ?? new Set<string>();
	set.add(serviceId);
	servicesByDate.set(date, set);
};

for (const row of calendar) {
	const start = new Date(`${isoDate(row.start_date ?? "")}T00:00:00Z`);
	const end = new Date(`${isoDate(row.end_date ?? "")}T00:00:00Z`);
	for (let d = start; d <= end; d = new Date(d.getTime() + 86_400_000)) {
		const weekday = WEEKDAYS[d.getUTCDay()];
		if (weekday && row[weekday] === "1") {
			addService(d.toISOString().slice(0, 10), row.service_id ?? "");
		}
	}
}
for (const row of calendarDates) {
	const date = isoDate(row.date ?? "");
	if (row.exception_type === "1") addService(date, row.service_id ?? "");
	if (row.exception_type === "2") servicesByDate.get(date)?.delete(row.service_id ?? "");
}

const calendarDays: GtfsCalendarDay[] = [...servicesByDate]
	.flatMap(([date, ids]) =>
		[...ids].map((serviceId) => ({
			date,
			serviceId,
			...splitServiceId(serviceId),
		})),
	)
	.sort((a, b) => a.date.localeCompare(b.date));

// ---------- stops, routes, trips ----------

const stopName = new Map(stops.map((s) => [s.stop_id ?? "", s.stop_name ?? ""]));

const lines: GtfsLine[] = routes
	.map((r) => ({
		id: r.route_id ?? "",
		name: r.route_short_name || r.route_long_name || r.route_id || "",
	}))
	.sort((a, b) => naturalCompare(a.name, b.name));

type TripRow = (typeof trips)[number];
const tripById = new Map<string, TripRow>(trips.map((t) => [t.trip_id ?? "", t]));

// stop_times grouped by trip, in sequence order
const stopTimesByTrip = new Map<string, typeof stopTimes>();
for (const st of stopTimes) {
	const list = stopTimesByTrip.get(st.trip_id ?? "") ?? [];
	list.push(st);
	stopTimesByTrip.set(st.trip_id ?? "", list);
}
for (const list of stopTimesByTrip.values()) {
	list.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
}

// ---------- outputs ----------

const outFiles = new Map<string, unknown>();
const emit = (path: string, data: unknown) => outFiles.set(path, data);

// trips (bucketed) + stop schedules + line variants
const schedules = new Map<string, GtfsDeparture[]>(); // key: serviceId|stopId
const variants = new Map<string, GtfsLineVariant>(); // key: lineId|dir|shape|stops
const buckets = new Map<string, GtfsTripBucket>();

for (const [tripId, times] of stopTimesByTrip) {
	const trip = tripById.get(tripId);
	if (!trip) continue;

	const serviceId = trip.service_id ?? "";
	const lineId = trip.route_id ?? "";
	const headsign = trip.trip_headsign ?? "";
	const courseId = courseIdOf(tripId);
	const shapeId = trip.shape_id || null;
	const directionId = Number(trip.direction_id || 0);

	const tripOut: GtfsTrip = {
		courseId,
		serviceId,
		lineId,
		headsign,
		directionId,
		shapeId,
		stops: times.map((st) => ({
			id: Number(st.stop_id),
			name: stopName.get(st.stop_id ?? "") ?? "",
			arrival: hhmm(st.arrival_time ?? ""),
			departure: hhmm(st.departure_time ?? ""),
			onRequest: st.pickup_type === "3" || st.drop_off_type === "3",
			noPickup: st.pickup_type === "1",
			noDropOff: st.drop_off_type === "1",
		})),
	};

	const bucketPath = GTFS_PATHS.tripBucket(
		splitServiceId(serviceId).version,
		courseId,
	);
	const bucket = buckets.get(bucketPath) ?? {};
	bucket[courseId] = tripOut;
	buckets.set(bucketPath, bucket);

	for (const stop of tripOut.stops) {
		if (stop.noPickup && stop.noDropOff) continue; // passes without stopping
		const key = `${serviceId}|${stop.id}`;
		const list = schedules.get(key) ?? [];
		list.push({
			time: stop.departure,
			lineId,
			headsign,
			courseId,
			onRequest: stop.onRequest,
			dropOffOnly: stop.noPickup,
		});
		schedules.set(key, list);
	}

	const stopIds = tripOut.stops.map((s) => s.id).join(",");
	const variantKey = `${lineId}|${directionId}|${headsign}|${stopIds}`;
	const variant = variants.get(variantKey);
	if (variant) {
		variant.tripCount++;
	} else {
		variants.set(variantKey, {
			directionId,
			headsign,
			shapeId,
			tripCount: 1,
			stops: tripOut.stops.map(({ id, name }) => ({ id, name })),
		});
	}
}

for (const [path, bucket] of buckets) emit(path, bucket);

for (const [key, departures] of schedules) {
	const [serviceId = "", stopId = ""] = key.split("|");
	departures.sort(
		(a, b) => a.time.localeCompare(b.time) || naturalCompare(a.lineId, b.lineId),
	);
	emit(GTFS_PATHS.stopSchedule(serviceId, Number(stopId)), departures);
}

const variantsByLine = new Map<string, GtfsLineVariant[]>();
for (const [key, variant] of variants) {
	const lineId = key.split("|")[0] ?? "";
	const list = variantsByLine.get(lineId) ?? [];
	list.push(variant);
	variantsByLine.set(lineId, list);
}
for (const line of lines) {
	const details: GtfsLineDetails = {
		...line,
		variants: (variantsByLine.get(line.id) ?? []).sort(
			(a, b) => a.directionId - b.directionId || b.tripCount - a.tripCount,
		),
	};
	emit(GTFS_PATHS.line(line.id), details);
}

// shapes
const shapePoints = new Map<string, { seq: number; lat: number; lon: number }[]>();
for (const p of shapes) {
	const list = shapePoints.get(p.shape_id ?? "") ?? [];
	list.push({
		seq: Number(p.shape_pt_sequence),
		lat: Number(p.shape_pt_lat),
		lon: Number(p.shape_pt_lon),
	});
	shapePoints.set(p.shape_id ?? "", list);
}
for (const [shapeId, points] of shapePoints) {
	const shape: GtfsShape = points
		.sort((a, b) => a.seq - b.seq)
		.map((p) => [p.lat, p.lon]);
	emit(GTFS_PATHS.shape(shapeId), shape);
}

const info = feedInfo[0] ?? {};
const meta: GtfsMeta = {
	publisher: agency[0]?.agency_name ?? "",
	feedVersion: info.feed_version ?? "",
	validFrom: isoDate(info.feed_start_date ?? calendarDays[0]?.date.replaceAll("-", "") ?? ""),
	validTo: isoDate(info.feed_end_date ?? calendarDays.at(-1)?.date.replaceAll("-", "") ?? ""),
	sourceUrl: args.zip ? `file:${args.zip}` : SOURCE_URL,
	sourceEtag: source.etag,
	sourceLastModified: source.lastModified,
	generatedAt: new Date().toISOString(),
};
emit(GTFS_PATHS.meta, meta);
emit(GTFS_PATHS.calendar, calendarDays);
emit(GTFS_PATHS.lines, lines);
emit(
	GTFS_PATHS.stops,
	stops.map(
		(s): GtfsStop => ({
			id: Number(s.stop_id),
			name: s.stop_name ?? "",
			lat: Number(s.stop_lat),
			lon: Number(s.stop_lon),
		}),
	),
);

// ---------- write ----------

const outRoot = args.out ?? "public";
await rm(join(outRoot, "gtfs"), { recursive: true, force: true });

let bytes = 0;
for (const [path, data] of outFiles) {
	const file = join(outRoot, path);
	const json = JSON.stringify(data);
	bytes += Buffer.byteLength(json);
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, json);
}

console.log(
	`GTFS ${meta.feedVersion} (${meta.validFrom} → ${meta.validTo}): ` +
		`${outFiles.size} files, ${(bytes / 1024 / 1024).toFixed(1)} MB → ${outRoot}/gtfs`,
);
console.log(
	`  ${lines.length} lines, ${stops.length} stops, ${trips.length} trips, ` +
		`${schedules.size} stop schedules, ${shapePoints.size} shapes, ${calendarDays.length} calendar days`,
);
