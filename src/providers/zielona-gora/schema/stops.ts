import { z, zLocation, zText } from "./common";

// /BusStops/GetMapBusStopListJson — field order from site-busstops.index.js
const zRawStop = z
	.tuple([
		z.number(), // 0 id
		zText, // 1 name
		z.string(), // 2 number (stop post number shown on the sign)
		z.number(), // 3 id_cfg (stop type config)
		z.number(), // 4 longitude
		z.number(), // 5 latitude
		z.number(), // 6 pic
		z.string(), // 7 vehicle type ("A" = bus)
		z.number(), // 8 realTimetableType
		z.number(), // 9 timetable (1 = has timetable, shown on map)
		z.number(), // 10 unknown
		z.string(), // 11 kind
	])
	.rest(z.unknown());

export const zStop = z.object({
	id: z.number(),
	name: z.string(),
	number: z.string(),
	configId: z.number(),
	location: zLocation,
	vehicleType: z.string(),
	realTimetableType: z.number(),
	hasTimetable: z.boolean().meta({
		description: "Stops without timetable are hidden on the MZK map",
	}),
	kind: z.string(),
});

export const zGetStopsUpstream = z.array(
	zRawStop.transform(
		(s): z.infer<typeof zStop> => ({
			id: s[0],
			name: s[1],
			number: s[2],
			configId: s[3],
			location: { x: s[4], y: s[5] },
			vehicleType: s[7],
			realTimetableType: s[8],
			hasTimetable: s[9] === 1,
			kind: s[11],
		}),
	),
);

export const zStopsResponse = z.object({
	stops: z.array(zStop),
});

// /Routes/GetBusStopDetails — field order from Stop.js
export const zStopDetailsResponse = z.object({
	id: z.number(),
	name: z.string(),
	number: z.string(),
	location: zLocation,
	lines: z.array(
		z.object({
			routeId: z.number(),
			lineNumber: z.string(),
		}),
	),
});

export const zGetStopDetailsUpstream = z
	.tuple([
		z.number(), // 0 id
		zText, // 1 name
		z.string(), // 2 number
		z.number(), // 3 id_cfg
		z.number(), // 4 longitude
		z.number(), // 5 latitude
		z.number(), // 6 pic
		// 7 lines grouped by route type: [[], [id_cfg, [routeId, "14", routeId, "27", ...]], []]
		z.array(z.array(z.unknown())),
	])
	.rest(z.unknown())
	.transform((s): z.infer<typeof zStopDetailsResponse> => {
		const lines: { routeId: number; lineNumber: string }[] = [];
		for (const group of s[7]) {
			const routes = group[1];
			if (!Array.isArray(routes)) continue;
			for (let i = 0; i + 1 < routes.length; i += 2) {
				lines.push({
					routeId: Number(routes[i]),
					lineNumber: String(routes[i + 1]).trim(),
				});
			}
		}
		return {
			id: s[0],
			name: s[1],
			number: s[2],
			location: { x: s[4], y: s[5] },
			lines,
		};
	});
