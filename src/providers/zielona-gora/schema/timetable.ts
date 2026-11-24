import { z, zLocation } from "./common";

// Response schemas for the GTFS-based timetable routes (documentation only —
// the data is validated when it's built by scripts/gtfs/build.ts).

const zDayType = z.string().meta({
	description:
		"MZK day type: RO = working day (school), SW = Saturday, DS = Sunday/holiday, RW = working day (no school)",
	example: "RO",
});

export const zCalendarResponse = z.object({
	feed: z.object({
		publisher: z.string(),
		version: z.string(),
		validFrom: z.string(),
		validTo: z.string(),
		publishedAt: z.string().nullable().meta({
			description:
				"When MZK published this timetable (ISO 8601) — show this as the timetable's date",
			example: "2026-11-23T06:10:54.000Z",
		}),
		generatedAt: z.string().meta({
			description: "When this API last rebuilt the data (changes on every deploy)",
		}),
	}),
	days: z.array(
		z.object({
			date: z.string(),
			dayType: zDayType,
			serviceId: z.string(),
		}),
	),
});

export const zLinesResponse = z.object({
	lines: z.array(z.object({ id: z.string(), name: z.string() })),
});

export const zLineResponse = z.object({
	id: z.string(),
	name: z.string(),
	variants: z.array(
		z.object({
			directionId: z.number(),
			headsign: z.string(),
			shapeId: z.string().nullable().meta({
				description: "Use with /v1/zg/shapes/{shapeId} to draw the route",
			}),
			tripCount: z.number().meta({
				description: "Trips in the feed following this stop sequence — the most common variants come first",
			}),
			stops: z.array(z.object({ id: z.number(), name: z.string() })),
		}),
	),
});

const zTime = z.object({
	time: z.string().meta({ description: "HH:MM, 24h", example: "21:13" }),
	nextDay: z.boolean().meta({
		description: "Departure is after midnight but belongs to this service day",
	}),
});

export const zScheduleResponse = z.object({
	date: z.string(),
	dayTypes: z.array(zDayType),
	stop: z.object({ id: z.number(), name: z.string() }),
	departures: z.array(
		zTime.extend({
			lineNumber: z.string(),
			headsign: z.string(),
			courseId: z.number().meta({
				description: "Same as courseId in the live API — use with /v1/zg/courses/{courseId}",
			}),
			onRequest: z.boolean().meta({ description: "Request stop (na żądanie)" }),
			dropOffOnly: z.boolean(),
		}),
	),
});

export const zCourseResponse = z.object({
	date: z.string(),
	dayType: zDayType,
	courseId: z.number(),
	lineNumber: z.string(),
	headsign: z.string(),
	directionId: z.number(),
	shapeId: z.string().nullable(),
	stops: z.array(
		z.object({
			sequence: z.number(),
			id: z.number(),
			name: z.string(),
			arrival: zTime,
			departure: zTime,
			onRequest: z.boolean(),
			noPickup: z.boolean(),
			noDropOff: z.boolean(),
		}),
	),
	path: z.array(zLocation).meta({ description: "Route geometry, empty if unknown" }),
});

export const zShapeResponse = z.object({
	id: z.string(),
	path: z.array(zLocation),
});
