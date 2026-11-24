import { NotFoundError, UpstreamError } from "../../../lib/errors";
import {
	GTFS_PATHS,
	type GtfsCalendarDay,
	type GtfsDeparture,
	type GtfsLine,
	type GtfsLineDetails,
	type GtfsMeta,
	type GtfsShape,
	type GtfsStop,
	type GtfsStopLines,
	type GtfsTrip,
	type GtfsTripBucket,
} from "./files";

/**
 * Reads the GTFS JSON files (built by `pnpm gtfs`) from Workers Static Assets.
 */
export class GtfsStore {
	constructor(private readonly assets: Fetcher) {}

	private async read<T>(path: string): Promise<T> {
		// The host is ignored by the assets binding; only the path matters
		const res = await this.assets.fetch(`https://assets.local${path}`);
		if (res.status === 404) throw new NotFoundError();
		if (!res.ok) {
			throw new UpstreamError(`Timetable data unavailable (${res.status})`);
		}
		return res.json<T>();
	}

	meta = async () => {
		try {
			return await this.read<GtfsMeta>(GTFS_PATHS.meta);
		} catch (error) {
			if (error instanceof NotFoundError) {
				// Only happens when the feed wasn't built before `wrangler dev`/deploy
				throw new UpstreamError("Timetable data not built — run `pnpm gtfs`");
			}
			throw error;
		}
	};

	calendar = () => this.read<GtfsCalendarDay[]>(GTFS_PATHS.calendar);
	stops = () => this.read<GtfsStop[]>(GTFS_PATHS.stops);
	stopLines = () => this.read<GtfsStopLines>(GTFS_PATHS.stopLines);
	lines = () => this.read<GtfsLine[]>(GTFS_PATHS.lines);
	line = (lineId: string) => this.read<GtfsLineDetails>(GTFS_PATHS.line(lineId));
	shape = (shapeId: string) => this.read<GtfsShape>(GTFS_PATHS.shape(shapeId));

	/** Departures of a stop on one service day; empty when no bus stops there that day. */
	stopSchedule = async (serviceId: string, stopId: number) => {
		try {
			return await this.read<GtfsDeparture[]>(
				GTFS_PATHS.stopSchedule(serviceId, stopId),
			);
		} catch (error) {
			if (error instanceof NotFoundError) return [];
			throw error;
		}
	};

	trip = async (
		version: string,
		courseId: number,
	): Promise<GtfsTrip | undefined> => {
		try {
			const bucket = await this.read<GtfsTripBucket>(
				GTFS_PATHS.tripBucket(version, courseId),
			);
			return bucket[courseId];
		} catch (error) {
			if (error instanceof NotFoundError) return undefined;
			throw error;
		}
	};

	/**
	 * Timetables in force on `date` (normally exactly one).
	 * Throws 404 with the feed's validity range when the date isn't covered.
	 */
	servicesOn = async (date: string) => {
		const [meta, calendar] = await Promise.all([this.meta(), this.calendar()]);
		const days = calendar.filter((d) => d.date === date);
		if (days.length === 0) {
			throw new NotFoundError(
				`No timetable for ${date}. Available: ${meta.validFrom} – ${meta.validTo}`,
			);
		}
		return days;
	};
}

/** Today's date in Poland as YYYY-MM-DD. */
export const todayInPoland = () =>
	new Intl.DateTimeFormat("en-CA", {
		timeZone: "Europe/Warsaw",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(new Date());

/** "25:10" → { time: "01:10", nextDay: true } */
export const normalizeTime = (gtfsTime: string) => {
	const [h = 0, m = 0] = gtfsTime.split(":").map(Number);
	return {
		time: `${String(h % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
		nextDay: h >= 24,
	};
};

/** GTFS [lat, lon] → API { x: lon, y: lat } */
export const toPath = (shape: GtfsShape) =>
	shape.map(([lat, lon]) => ({ x: lon, y: lat }));
