import { XMLParser } from "fast-xml-parser";
import { z } from "../../lib/zod";
import { createEndpoint } from "../../lib/upstream";
import { zGetDeparturesUpstream } from "./schema/departures";
import { zGetStopDetailsUpstream, zGetStopsUpstream } from "./schema/stops";
import { zGetTripTrackUpstream } from "./schema/trip-track";
import { zGetVehicleTimetableUpstream } from "./schema/vehicle-timetable";
import { zGetVehiclesUpstream } from "./schema/vehicles";

const ZG_BASE_URL = "https://rj.mzk.zgora.pl" as const;

/** Parser for XML where data lives in attributes (<Stop id="6" name="..."/>). */
const createAttributeXmlParser = (arrayTags: string[]) =>
	new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "",
		parseAttributeValue: false,
		processEntities: true,
		htmlEntities: true,
		isArray: (tagName) => arrayTags.includes(tagName),
	});

/** Typed client for the MZK Zielona Góra passenger information system. */
export const mzkClient = {
	getVehicles: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: () => "/Routes/CNR_GetVehicles?r=%all%",
		cacheSeconds: 5, // shared by all ?line= filters; below the 10 s response ttl
		format: "xml",
		xmlParser: new XMLParser({
			ignoreAttributes: true,
			parseTagValue: true,
			trimValues: true,
			isArray: (tagName) => tagName === "p",
			processEntities: true,
			htmlEntities: true,
		}),
		schema: zGetVehiclesUpstream,
	}),

	getVehicleTimetable: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: ({ vehicleNumber }: { vehicleNumber: number }) =>
			`/Routes/CNR_GetVehicleTimeTable?n=${vehicleNumber}`,
		format: "xml",
		xmlParser: createAttributeXmlParser(["Stop"]),
		schema: zGetVehicleTimetableUpstream,
	}),

	getStops: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: () => "/BusStops/GetMapBusStopListJson?q=&tId=null",
		format: "json",
		schema: zGetStopsUpstream,
	}),

	getStopDetails: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: ({ stopId }: { stopId: number }) =>
			`/Routes/GetBusStopDetails?nBusStopId=${stopId}`,
		format: "json",
		schema: zGetStopDetailsUpstream,
	}),

	getDepartures: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: ({ stopId }: { stopId: number }) =>
			`/TimeTable/GetTimetableReal?busStopId=${stopId}`,
		format: "xml",
		xmlParser: createAttributeXmlParser(["Stop", "Day", "R", "S"]),
		schema: zGetDeparturesUpstream,
	}),

	getTripTrack: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: ({ tripId, timetableId }: { tripId: number; timetableId: number }) =>
			`/Trip/GetTrackJson?tripId=${tripId}&tId=${timetableId}`,
		format: "json",
		schema: zGetTripTrackUpstream,
	}),

	/** Trip planner. The body is XML + JS literal, parsed by schema/planner.ts. */
	searchConnections: createEndpoint({
		baseUrl: ZG_BASE_URL,
		path: (q: PlannerQuery) => {
			const params = new URLSearchParams({
				lng1: String(q.from.lon),
				lat1: String(q.from.lat),
				lng2: String(q.to.lon),
				lat2: String(q.to.lat),
				hour: q.time,
				date: q.date,
				lang: "pl",
				c: "0",
				transfers: String(q.maxTransfers),
				// "1" (arrive by) always returns no connections on MZK's side
				searchMode: "0",
				carriers: "",
				skipRoutes: "",
				vehicleFlags: q.lowFloor ? "N" : "",
				transports: "",
				walkDistanceMode: String(q.walk),
			});
			return `/TripPlanner/SearchConnection?${params}`;
		},
		format: "text",
		schema: z.string(),
	}),
};

export type PlannerQuery = {
	from: { lat: number; lon: number };
	to: { lat: number; lon: number };
	date: string; // YYYY-MM-DD
	time: string; // HH:MM
	maxTransfers: number; // 0–4, 4 = MZK's "no limit"
	walk: 0 | 1 | 2;
	lowFloor: boolean;
};
