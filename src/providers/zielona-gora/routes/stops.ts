import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { distanceMeters, normalizeName, parseLatLon } from "../../../lib/geo";
import { UpstreamError } from "../../../lib/errors";
import { annotate } from "../../../lib/tracing";
import {
	errorResponses,
	idParam,
	jsonResponse,
	matchesLine,
	query,
	zLineParam,
} from "../../../lib/openapi";
import { z, zLocation } from "../../../lib/zod";
import { GtfsStore } from "../gtfs/store";
import { mzkClient } from "../client";
import { zDeparturesResponse } from "../schema/departures";
import { zStopDetailsResponse, zStopsResponse } from "../schema/stops";

const zStopSearchResponse = z.object({
	stops: z.array(
		z.object({
			id: z.number(),
			name: z.string(),
			location: zLocation,
			distanceMeters: z.number().nullable().meta({ description: "Set when `near` is given" }),
		}),
	),
});

const zStopsWithLinesResponse = z.object({
	stops: z.array(
		z.object({
			id: z.number(),
			name: z.string(),
			location: zLocation,
			lines: z.array(z.string()).meta({ example: ["14", "27", "44"] }),
		}),
	),
});

export const stops = new Hono<AppEnv>()
	.get(
		"/search",
		describeRoute({
			operationId: "searchZgStops",
			description:
				"Find stops by name (diacritics-insensitive) and/or nearest to a point — e.g. for trip planner inputs.",
			responses: {
				200: jsonResponse(zStopSearchResponse, "Matching stops, nearest or best match first"),
				400: errorResponses[400],
				502: errorResponses[502],
			},
		}),
		edgeCache(CACHE.DAILY),
		query({
			q: z
				.string()
				.min(1)
				.max(64)
				.optional()
				.meta({ example: "dworzec" }),
			near: z
				.string()
				.regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "expected lat,lon")
				.optional()
				.meta({
					description: "`lat,lon` — sort by distance",
					example: "51.9358,15.4960",
				}),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(20)
				,
		}),
		async (c) => {
			const { q, near, limit } = c.req.valid("query");
			const all = await new GtfsStore(c.env.ASSETS).stops();
			const point = near ? parseLatLon(near) : undefined;
			const needle = q ? normalizeName(q) : undefined;

			const results = all
				.filter((s) => !needle || normalizeName(s.name).includes(needle))
				.map((s) => ({
					id: s.id,
					name: s.name,
					location: { x: s.lon, y: s.lat },
					distanceMeters: point ? distanceMeters(point, s) : null,
					// names starting with the query rank first
					rank: needle && normalizeName(s.name).startsWith(needle) ? 0 : 1,
				}))
				.sort(
					(a, b) =>
						(a.distanceMeters ?? 0) - (b.distanceMeters ?? 0) ||
						a.rank - b.rank ||
						a.name.localeCompare(b.name, "pl"),
				)
				.slice(0, limit)
				.map(({ rank, ...stop }) => stop);

			return c.json({ stops: results });
		},
	)

	.get(
		"/",
		describeRoute({
			operationId: "getZgStops",
			description:
				"List of all stops. If MZK is unreachable and nothing is cached, returns 203 with the list built from the GTFS timetable (`X-Data-Source: gtfs`; `number`, `configId`, `kind` empty).",
			responses: {
				200: jsonResponse(zStopsResponse, "All stops with location"),
				502: errorResponses[502],
			},
		}),
		edgeCache(CACHE.STATIC),
		async (c) => {
			try {
				return c.json({ stops: await mzkClient.getStops() });
			} catch (error) {
				if (!(error instanceof UpstreamError)) throw error;
				// MZK down and nothing cached yet: build the list from the GTFS feed
				// (same stop ids and names). 203 = not the original source, and the
				// edge cache only keeps 200s, so the real list replaces it next time.
				annotate({ "data.source": "gtfs-fallback" });
				const gtfsStops = await new GtfsStore(c.env.ASSETS).stops();
				c.header("X-Data-Source", "gtfs");
				return c.json(
					{
						stops: gtfsStops.map((s) => ({
							id: s.id,
							name: s.name,
							number: "",
							configId: 0,
							location: { x: s.lon, y: s.lat },
							vehicleType: "A",
							realTimetableType: 0,
							hasTimetable: true,
							kind: "",
						})),
					},
					203,
				);
			}
		},
	)

	.get(
		"/with-lines",
		describeRoute({
			operationId: "getZgStopsWithLines",
			description:
				"All stops with the lines serving them, in one request — for map markers and line filters. `?line=27` (or `27,14`) keeps only stops of those lines.",
			responses: {
				200: jsonResponse(zStopsWithLinesResponse, "Stops with their lines"),
				400: errorResponses[400],
				502: errorResponses[502],
			},
		}),
		edgeCache(CACHE.DAILY),
		query({ line: zLineParam }),
		async (c) => {
			const { line } = c.req.valid("query");
			const gtfs = new GtfsStore(c.env.ASSETS);
			const [all, stopLines] = await Promise.all([gtfs.stops(), gtfs.stopLines()]);

			const result = all
				.map((s) => ({
					id: s.id,
					name: s.name,
					location: { x: s.lon, y: s.lat },
					lines: stopLines[s.id] ?? [],
				}))
				.filter((s) => s.lines.length > 0)
				.filter((s) => !line || s.lines.some((l) => matchesLine(line, l)));

			return c.json({ stops: result });
		},
	)

	.get(
		"/:stopId",
		describeRoute({
			operationId: "getZgStopDetails",
			description: "Stop details with lines serving it",
			responses: {
				200: jsonResponse(zStopDetailsResponse, "Stop details"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.STATIC),
		idParam("stopId"),
		async (c) => {
			const { stopId } = c.req.valid("param");
			return c.json(await mzkClient.getStopDetails({ stopId }));
		},
	)

	.get(
		"/:stopId/departures",
		describeRoute({
			operationId: "getZgStopDepartures",
			description:
				"Real-time departures from a stop. `?courseId=2421` returns just that course — a tiny response for live activities / ongoing notifications polling one bus; an empty list means it has already left (or isn't shown yet). `?line=27` keeps only those lines.",
			responses: {
				200: jsonResponse(zDeparturesResponse, "Next departures"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.REALTIME),
		idParam("stopId"),
		query({
			line: zLineParam,
			courseId: z.coerce
				.number()
				.int()
				.positive()
				.optional()
				.meta({
					description: "Only this course (from departures, schedules or /v1/zg/vehicles)",
					example: 2421,
				}),
		}),
		async (c) => {
			const { stopId } = c.req.valid("param");
			const { line, courseId } = c.req.valid("query");
			const result = await mzkClient.getDepartures({ stopId });
			if (!line && courseId === undefined) return c.json(result);

			return c.json({
				...result,
				days: result.days.map((day) => ({
					...day,
					departures: day.departures.filter(
						(d) =>
							matchesLine(line, d.lineNumber) &&
							(courseId === undefined || d.courseId === courseId),
					),
				})),
			});
		},
	);
