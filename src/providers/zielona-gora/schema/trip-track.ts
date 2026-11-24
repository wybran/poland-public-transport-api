import { z, zLocation, zText } from "./common";

// /Trip/GetTrackJson — structure as used in MapRouteVariant.js:
// [tripData: [lp, minutesFromMidnight][], [stops[], transits[]]]  or  [] when trip is unknown
const zRawTripTime = z.tuple([z.number(), z.number()]).rest(z.unknown());

const zRawTrackStop = z
	.tuple([
		z.number(), // 0 id
		zText, // 1 name
		z.string(), // 2 number
		z.number(), // 3 longitude
		z.number(), // 4 latitude
		z.number(), // 5 id_cfg
		z.number(), // 6 street id
		zText, // 7 street name
		z.string(), // 8 kind
	])
	.rest(z.unknown());

const zRawTransit = z
	.tuple([
		z.number(), // 0
		z.number(), // 1 from stop index
		z.number(), // 2 to stop index
		z.array(z.number()), // 3 flat [lon, lat, lon, lat, ...]
		z.number(), // 4
		z.number(), // 5 zot flag
		z.number(), // 6 nz flag (na żądanie)
	])
	.rest(z.unknown());

const toHHMM = (minutes: number) => {
	const h = Math.floor(minutes / 60) % 24;
	const m = minutes % 60;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

export const zTripTrackResponse = z.object({
	stops: z.array(
		z.object({
			sequence: z.number(),
			id: z.number(),
			name: z.string(),
			number: z.string(),
			location: zLocation,
			street: z.string(),
			departureTime: z.string().nullable().openapi({ description: "HH:MM" }),
			onRequest: z.boolean().openapi({
				description: "Request stop (na żądanie) for the segment leaving this stop",
			}),
		}),
	),
	segments: z.array(
		z.object({
			fromIndex: z.number(),
			toIndex: z.number(),
			path: z.array(zLocation),
		}),
	),
});

export const zGetTripTrackUpstream = z
	.union([
		z.tuple([]),
		z
			.tuple([
				z.array(zRawTripTime),
				z.tuple([z.array(zRawTrackStop), z.array(zRawTransit)]).rest(z.unknown()),
			])
			.rest(z.unknown()),
	])
	.transform((raw): z.infer<typeof zTripTrackResponse> | null => {
		const [times, route] = raw;
		if (!times || !route) return null;
		const [stops, transits] = route;

		return {
			stops: stops.map((s, i) => ({
				sequence: i + 1,
				id: s[0],
				name: s[1],
				number: s[2],
				location: { x: s[3], y: s[4] },
				street: s[7],
				departureTime: times[i] ? toHHMM(times[i][1]) : null,
				onRequest: transits[i]?.[6] === 1,
			})),
			segments: transits.map((t) => {
				const coords = t[3];
				const path: { x: number; y: number }[] = [];
				for (let i = 0; i + 1 < coords.length; i += 2) {
					path.push({ x: coords[i] as number, y: coords[i + 1] as number });
				}
				return { fromIndex: t[1], toIndex: t[2], path };
			}),
		};
	});
