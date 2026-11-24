import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import {
	errorResponses,
	idParam,
	jsonResponse,
	query,
} from "../../../lib/openapi";
import { z, zLocation } from "../../../lib/zod";
import { GtfsStore } from "../gtfs/store";
import { mzkClient } from "../client";
import { zDeparturesResponse } from "../schema/departures";
import { zStopDetailsResponse, zStopsResponse } from "../schema/stops";

/** Lower-case, no Polish diacritics: "Łężyca" → "lezyca". */
const normalize = (s: string) =>
	s
		.toLowerCase()
		.replace(/ł/g, "l")
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "");

/** Distance in meters (equirectangular — plenty accurate within a city). */
const distance = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
	const x = ((b.lon - a.lon) * Math.PI) / 180 * Math.cos(((a.lat + b.lat) * Math.PI) / 360);
	const y = ((b.lat - a.lat) * Math.PI) / 180;
	return Math.round(Math.sqrt(x * x + y * y) * 6_371_000);
};

const zStopSearchResponse = z.object({
	stops: z.array(
		z.object({
			id: z.number(),
			name: z.string(),
			location: zLocation,
			distanceMeters: z.number().nullable().openapi({ description: "Set when `near` is given" }),
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
				.openapi({ param: { name: "q", in: "query" }, example: "dworzec" }),
			near: z
				.string()
				.regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "expected lat,lon")
				.optional()
				.openapi({
					param: { name: "near", in: "query" },
					description: "`lat,lon` — sort by distance",
					example: "51.9358,15.4960",
				}),
			limit: z.coerce
				.number()
				.int()
				.min(1)
				.max(100)
				.default(20)
				.openapi({ param: { name: "limit", in: "query" } }),
		}),
		async (c) => {
			const { q, near, limit } = c.req.valid("query");
			const all = await new GtfsStore(c.env.ASSETS).stops();
			const [lat, lon] = near?.split(",").map(Number) ?? [];
			const point = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
			const needle = q ? normalize(q) : undefined;

			const results = all
				.filter((s) => !needle || normalize(s.name).includes(needle))
				.map((s) => ({
					id: s.id,
					name: s.name,
					location: { x: s.lon, y: s.lat },
					distanceMeters: point ? distance(point, s) : null,
					// names starting with the query rank first
					rank: needle && normalize(s.name).startsWith(needle) ? 0 : 1,
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
			description: "List of all stops",
			responses: {
				200: jsonResponse(zStopsResponse, "All stops with location"),
				502: errorResponses[502],
			},
		}),
		edgeCache(CACHE.STATIC),
		async (c) => c.json({ stops: await mzkClient.getStops() }),
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
			description: "Real-time departures from a stop",
			responses: {
				200: jsonResponse(zDeparturesResponse, "Next departures"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.REALTIME),
		idParam("stopId"),
		async (c) => {
			const { stopId } = c.req.valid("param");
			return c.json(await mzkClient.getDepartures({ stopId }));
		},
	);
