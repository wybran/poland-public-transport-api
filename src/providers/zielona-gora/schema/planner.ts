import { NotFoundError } from "../../../lib/errors";
import { jsLiteralToJson } from "../planner/js-literal";
import { decodeEntities, z, zLocation } from "./common";

// /TripPlanner/SearchConnection — XML wrapping a JS literal meant for eval():
//   <CONNECTIONS><json><![CDATA[[{id:'t_0',start_time:…,data:[[…27 fields…], …]}]]]></json></CONNECTIONS>
// or <kod_bledu>N</kod_bledu> on error. Field meanings from site-tripplanner.index.js.

const zRow = z
	.tuple([
		z.number(), // 0  stop id (0 = start / destination point)
		z.string(), // 1  name
		z.number(), // 2  longitude
		z.number(), // 3  latitude
		z.boolean(), // 4  reached on foot
		z.boolean(), // 5  transfer (boarding a new vehicle here)
		z.string(), // 6  line
		z.string(), // 7  vehicle type
		z.array(z.object({ lat: z.number(), lng: z.number() })), // 8 path to next point
		z.number(), // 9  stop config id
		z.number(), // 10 walking time (s)
		z.number(), // 11 live deviation (s, negative = late)
		z.number(), // 12 time: seconds, 86400 = midnight of the requested day
		z.number(), // 13 seconds from now until this time
		z.string(), // 14 date when not the requested day
		z.number(), // 15 transfer number
		z.number(), // 16 planner trip id (use with /v1/zg/trips/{tripId}/track)
		z.number().nullable(), // 17 stop sequence in the trip
		z.number(), // 18 line type
		z.number(), // 19 vehicle side number (0 = unknown)
		z.number(), // 20 timetable id
		z.number(), // 21 request stop (na żądanie)
		z.number(), // 22 zot flag
		z.number(), // 23 route id (as in /v1/zg/stops/{id} lines)
		z.number(), // 24 direction id
	])
	.rest(z.unknown());

type Row = z.infer<typeof zRow>;

const zRawConnection = z.object({
	start_time: z.number(),
	end_time: z.number(),
	total_duration: z.number(),
	transit_time: z.number(),
	walk_time: z.number(),
	wait_time: z.number(),
	transit_distance: z.number(),
	walk_distance: z.number(),
	journey_start: z.number(),
	journey_end: z.number(),
	journey_duration: z.number(),
	data: z.array(zRow),
});

const zPlace = z.object({
	stopId: z.number().nullable().meta({ description: "null for the start/destination point" }),
	name: z.string(),
	location: zLocation,
});

const zTime = z.object({
	date: z.string().meta({ example: "2026-11-25" }),
	time: z.string().meta({ example: "10:07" }),
});

const zWalkLeg = z.object({
	type: z.literal("walk"),
	durationSeconds: z.number(),
	from: zPlace,
	to: zPlace,
});

const zBusLeg = z.object({
	type: z.literal("bus"),
	lineNumber: z.string(),
	vehicleType: z.string(),
	vehicleNumber: z.number().nullable().meta({ description: "Known for vehicles already on the road" }),
	deviationSeconds: z.number().meta({ description: "Live delay (negative) / early (positive)" }),
	tripId: z.number().meta({
		description: "Use with /v1/zg/trips/{tripId}/track?timetableId= for the full course",
	}),
	timetableId: z.number(),
	routeId: z.number(),
	departure: zTime,
	arrival: zTime,
	stops: z.array(
		zPlace.extend({
			time: zTime,
			onRequest: z.boolean(),
		}),
	),
	path: z.array(zLocation),
});

export const zPlannerResponse = z.object({
	connections: z.array(
		z.object({
			departure: zTime,
			arrival: zTime,
			durationSeconds: z.number(),
			transitSeconds: z.number(),
			walkSeconds: z.number(),
			waitSeconds: z.number(),
			transitDistanceMeters: z.number(),
			walkDistanceMeters: z.number(),
			transfers: z.number(),
			ticketTimeSeconds: z.number().meta({
				description:
					"How long a time ticket must be valid: from boarding the first bus to leaving the last one (no walking). Compare with `validityMinutes` in /v1/zg/fares.",
			}),
			legs: z.array(z.discriminatedUnion("type", [zWalkLeg, zBusLeg])),
		}),
	),
});

type PlannerResponse = z.infer<typeof zPlannerResponse>;
type Leg = PlannerResponse["connections"][number]["legs"][number];

const name = (s: string) => decodeEntities(s).replace(/ /g, " ").trim();

const place = (row: Row) => ({
	stopId: row[0] > 0 ? row[0] : null,
	name: name(row[1]),
	location: { x: row[2], y: row[3] },
});

/** Seconds where 86400 = midnight of `baseDate` → local date + HH:MM. */
const toTime = (baseDate: string, seconds: number) => {
	const dayOffset = Math.floor(seconds / 86400) - 1;
	const date = new Date(`${baseDate}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + dayOffset);
	const s = ((seconds % 86400) + 86400) % 86400;
	return {
		date: date.toISOString().slice(0, 10),
		time: `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`,
	};
};

const toLegs = (rows: Row[], baseDate: string): Leg[] => {
	const legs: Leg[] = [];
	let bus: Row[] = [];

	const flushBus = () => {
		if (bus.length < 2) {
			bus = [];
			return;
		}
		const first = bus[0] as Row;
		const last = bus.at(-1) as Row;
		legs.push({
			type: "bus",
			lineNumber: first[6].trim(),
			vehicleType: first[7],
			vehicleNumber: first[19] > 0 ? first[19] : null,
			deviationSeconds: first[11],
			tripId: first[16],
			timetableId: first[20],
			routeId: first[23],
			departure: toTime(baseDate, first[12]),
			arrival: toTime(baseDate, last[12]),
			stops: bus.map((r) => ({
				...place(r),
				time: toTime(baseDate, r[12]),
				onRequest: r[21] === 1,
			})),
			// each row's path leads to the next row; the last one belongs to the next leg
			path: bus.flatMap((r, i) => [
				{ x: r[2], y: r[3] },
				...(i < bus.length - 1 ? r[8].map((p) => ({ x: p.lng, y: p.lat })) : []),
			]),
		});
		bus = [];
	};

	for (let i = 1; i < rows.length; i++) {
		const row = rows[i] as Row;
		const prev = rows[i - 1] as Row;

		if (row[4]) {
			// reached on foot: close the running bus leg, then walk from the previous point
			flushBus();
			legs.push({
				type: "walk",
				durationSeconds: row[10],
				from: place(prev),
				to: place(row),
			});
		}

		if (row[16] > 0) {
			if (bus.length > 0 && (bus[0] as Row)[16] !== row[16]) flushBus();
			bus.push(row);
		}
	}
	flushBus();
	return legs;
};

/**
 * Parses the planner's XML/JS response. `baseDate` is the requested date
 * (times are relative to its midnight).
 */
export const parsePlannerResponse = (
	text: string,
	baseDate: string,
): PlannerResponse => {
	const errorCode = /<kod_bledu>\s*(\d+)\s*<\/kod_bledu>/.exec(text)?.[1];
	if (errorCode === "1") {
		throw new NotFoundError("Date is outside the timetable", "DATE_OUT_OF_RANGE");
	}
	if (errorCode) throw new NotFoundError("No connection found", "NO_CONNECTION");

	const literal = /<!\[CDATA\[([\s\S]*)\]\]>/.exec(text)?.[1] ?? "[]";
	const raw = z.array(zRawConnection).parse(JSON.parse(jsLiteralToJson(literal)));

	return {
		connections: raw.map((c) => {
			const legs = toLegs(c.data, baseDate);
			return {
				departure: toTime(baseDate, c.start_time),
				arrival: toTime(baseDate, c.end_time),
				durationSeconds: c.total_duration,
				transitSeconds: c.transit_time,
				walkSeconds: c.walk_time,
				waitSeconds: c.wait_time,
				transitDistanceMeters: c.transit_distance,
				walkDistanceMeters: c.walk_distance,
				transfers: Math.max(0, legs.filter((l) => l.type === "bus").length - 1),
				ticketTimeSeconds: c.journey_duration,
				legs,
			};
		}),
	};
};
