import { asObject, z, zIntAttr, zText, zTrimmedText } from "./common";

// /Routes/CNR_GetVehicleTimeTable — attributes as used in Vehicle.js
export const zVehicleTimetableResponse = z.object({
	courseId: z.number().nullable(),
	lineNumber: z.string(),
	routeVariant: z.string(),
	direction: z.string(),
	stops: z.array(
		z.object({
			sequence: z.number(),
			id: z.number(),
			name: z.string(),
			displayTime: z.string().meta({
				description: 'e.g. "5 min" or "19:31"',
			}),
			displayMode: z.number().meta({
				description:
					"1 = less than a minute, 2 = relative minutes, 3 = clock time",
			}),
			secondsToArrival: z.number(),
		}),
	),
});

const zRawStop = z.object({
	lp: zIntAttr,
	id: zIntAttr,
	name: zText,
	th: z.string().default(""),
	tm: zText.default(""),
	s: zIntAttr,
	m: zIntAttr,
});

export const zGetVehicleTimetableUpstream = z
	.object({
		Schedules: z.preprocess(
			asObject,
			z.object({
				id: zIntAttr.optional(),
				nr: zTrimmedText.default(""),
				type: z.string().default(""),
				o: zText.default(""),
				Stop: z.array(zRawStop).default([]),
			}),
		),
	})
	.transform(({ Schedules: s }): z.infer<typeof zVehicleTimetableResponse> => ({
		courseId: s.id ?? null,
		lineNumber: s.nr,
		routeVariant: s.type,
		direction: s.o,
		stops: s.Stop.map((stop) => ({
			sequence: stop.lp,
			id: stop.id,
			name: stop.name,
			displayTime: stop.th ? `${stop.th}:${stop.tm}` : stop.tm,
			displayMode: stop.m,
			secondsToArrival: stop.s,
		})),
	}));
