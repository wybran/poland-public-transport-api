/**
 * Layout and shapes of the static JSON files generated from MZK's GTFS feed
 * by `scripts/gtfs/build.ts` and served to the Worker as Static Assets.
 *
 * Shared by the build script (Node) and the Worker — keep it dependency-free.
 */

/** Trips are grouped into buckets so the feed fits the Static Assets file limit. */
export const TRIP_BUCKETS = 64;

export const GTFS_PATHS = {
	meta: "/gtfs/meta.json",
	calendar: "/gtfs/calendar.json",
	stops: "/gtfs/stops.json",
	stopLines: "/gtfs/stop-lines.json",
	lines: "/gtfs/lines.json",
	line: (lineId: string) => `/gtfs/lines/${encodeURIComponent(lineId)}.json`,
	stopSchedule: (serviceId: string, stopId: number) =>
		`/gtfs/stops/${serviceId}/${stopId}.json`,
	tripBucket: (version: string, courseId: number) =>
		`/gtfs/trips/${version}/${courseId % TRIP_BUCKETS}.json`,
	shape: (shapeId: string) => `/gtfs/shapes/${encodeURIComponent(shapeId)}.json`,
};

export type GtfsMeta = {
	publisher: string;
	feedVersion: string;
	validFrom: string; // YYYY-MM-DD
	validTo: string; // YYYY-MM-DD
	sourceUrl: string;
	sourceEtag: string | null;
	sourceLastModified: string | null;
	generatedAt: string; // ISO
};

/** Day type used by MZK: RO, SW, DS, RW (same codes as the live departures board). */
export type GtfsCalendarDay = {
	date: string; // YYYY-MM-DD
	serviceId: string; // e.g. "7387_RO"
	version: string; // e.g. "7387"
	dayType: string; // e.g. "RO"
};

export type GtfsStop = {
	id: number;
	name: string;
	lat: number;
	lon: number;
};

/** Stop id → line names (sorted) of every line stopping there in the feed. */
export type GtfsStopLines = Record<string, string[]>;

export type GtfsLine = {
	id: string;
	name: string;
};

export type GtfsLineStop = { id: number; name: string };

export type GtfsLineVariant = {
	directionId: number;
	headsign: string;
	shapeId: string | null;
	/** How many trips in the feed follow exactly this stop sequence */
	tripCount: number;
	stops: GtfsLineStop[];
};

export type GtfsLineDetails = GtfsLine & {
	variants: GtfsLineVariant[];
};

/** One departure in a stop's schedule for a service day. */
export type GtfsDeparture = {
	/** GTFS time, may exceed 24:00 for trips after midnight, e.g. "25:10" */
	time: string;
	lineId: string;
	headsign: string;
	/** Same as `courseId` in the live API */
	courseId: number;
	onRequest: boolean;
	/** Bus only drops off here (last stop / alighting only) */
	dropOffOnly: boolean;
};

export type GtfsTripStop = {
	id: number;
	name: string;
	arrival: string;
	departure: string;
	onRequest: boolean;
	noPickup: boolean;
	noDropOff: boolean;
};

export type GtfsTrip = {
	courseId: number;
	serviceId: string;
	lineId: string;
	headsign: string;
	directionId: number;
	shapeId: string | null;
	stops: GtfsTripStop[];
};

/** Trips of one bucket, keyed by courseId. */
export type GtfsTripBucket = Record<string, GtfsTrip>;

/** Shape polyline as [lat, lon] pairs. */
export type GtfsShape = [number, number][];
