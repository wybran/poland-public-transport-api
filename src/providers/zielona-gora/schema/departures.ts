import {
	asObject,
	z,
	zIntAttr,
	zText,
	zTrimmedText,
} from "./common";

// /TimeTable/GetTimetableReal — attributes as used in next-departures.js
const zRawDeparture = z.object({
	th: z.string().default(""), // hour (empty when "tm" is relative)
	tm: zText.default(""), // minutes, or relative text like "3 min" / "<1min"
	t: zText.default(""), // display text: "21:13" or "3 min"
	m: zIntAttr, // display mode: 1 = <1 min, 2 = relative minutes, 3 = clock time
	s: zIntAttr, // seconds to departure
	id: zIntAttr, // course id
	nb: zIntAttr, // vehicle side number (0 = not assigned yet)
	veh: z.string().default(""), // "T" = real-time (vehicle tracked)
	uw: zText.default(""), // departure note
	kuw: zTrimmedText.default(""), // course note symbol
});

const zRawRoute = z.object({
	nr: zTrimmedText,
	dir: zText,
	vt: z.string().default(""),
	vuw: z.string().default(""),
	S: z.array(zRawDeparture).default([]),
});

const zRawDay = z.object({
	type: z.string(),
	desc: zText.default(""),
	R: z.array(zRawRoute).default([]),
});

export const zDeparture = z.object({
	lineNumber: z.string(),
	direction: z.string(),
	displayTime: z.string().openapi({
		description: 'Text shown on MZK boards, e.g. "3 min" or "21:13"',
	}),
	displayMode: z.number().openapi({
		description: "1 = less than a minute, 2 = relative minutes, 3 = clock time",
	}),
	secondsToDeparture: z.number(),
	courseId: z.number(),
	vehicleNumber: z.number().nullable(),
	isRealtime: z.boolean(),
	vehicleType: z.string(),
	vehicleFeatures: z.string(),
	note: z.string(),
	courseNote: z.string(),
});

export const zDeparturesResponse = z.object({
	time: z.string(),
	stop: z.object({
		id: z.number(),
		name: z.string(),
		dispatchMessage: z.string(),
	}),
	days: z.array(
		z.object({
			type: z.string(),
			description: z.string(),
			departures: z.array(zDeparture),
		}),
	),
});

export const zGetDeparturesUpstream = z
	.object({
		Schedules: z.preprocess(
			asObject,
			z.object({
				time: z.string().default(""),
				Stop: z
					.array(
						z.object({
							name: zText,
							id: zIntAttr,
							ds: zText.default(""),
							Day: z.array(zRawDay).default([]),
						}),
					)
					.nonempty(),
			}),
		),
	})
	.transform(({ Schedules }): z.infer<typeof zDeparturesResponse> => {
		const stop = Schedules.Stop[0];
		return {
			time: Schedules.time,
			stop: { id: stop.id, name: stop.name, dispatchMessage: stop.ds },
			days: stop.Day.map((day) => ({
				type: day.type,
				description: day.desc,
				departures: day.R.flatMap((route) =>
					route.S.map((s) => ({
						lineNumber: route.nr,
						direction: route.dir,
						displayTime: s.t,
						displayMode: s.m,
						secondsToDeparture: s.s,
						courseId: s.id,
						vehicleNumber: s.nb > 0 ? s.nb : null,
						isRealtime: s.veh === "T",
						vehicleType: route.vt,
						vehicleFeatures: route.vuw,
						note: s.uw,
						courseNote: s.kuw,
					})),
				),
			})),
		};
	});
