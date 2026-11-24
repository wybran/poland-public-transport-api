import { XMLParser } from "fast-xml-parser";
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
		path: ({ tripId }: { tripId: number }) =>
			`/Trip/GetTrackJson?tripId=${tripId}&tId=0`,
		format: "json",
		schema: zGetTripTrackUpstream,
	}),
};
