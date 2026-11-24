import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { type ErrorCode, NotFoundError, UpstreamError } from "../../../lib/errors";
import { distanceMeters, parseLatLon } from "../../../lib/geo";
import {
	errorResponses,
	jsonResponse,
	matchesLine,
	query,
	zLineParam,
} from "../../../lib/openapi";
import { z, zLocation } from "../../../lib/zod";
import { mzkClient } from "../client";
import { GtfsStore } from "../gtfs/store";
import { zDeparture } from "../schema/departures";

const zNearbyResponse = z.object({
	stops: z.array(
		z.object({
			stop: z.object({
				id: z.number(),
				name: z.string(),
				location: zLocation,
				distanceMeters: z.number(),
			}),
			departures: z.array(zDeparture),
			errorCode: z.string().nullable().meta({
				description: "Set when this stop's departures couldn't be loaded (others still are)",
			}),
		}),
	),
});

const codeOf = (error: unknown): ErrorCode =>
	error instanceof UpstreamError || error instanceof NotFoundError
		? error.code
		: "INTERNAL_ERROR";

export const departures = new Hono<AppEnv>().get(
	"/nearby",
	describeRoute({
		operationId: "getZgDeparturesNearby",
		description:
			"Real-time departures from the nearest stops in one call — search + departures combined. Each stop is loaded independently, so one failing stop doesn't fail the response.",
		responses: {
			200: jsonResponse(zNearbyResponse, "Nearest stops with their next departures"),
			400: errorResponses[400],
			502: errorResponses[502],
		},
	}),
	edgeCache(CACHE.REALTIME),
	query({
		near: z
			.string()
			.regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "expected lat,lon")
			.meta({
				description: "`lat,lon` of the user",
				example: "51.9358,15.4960",
			}),
		radius: z.coerce
			.number()
			.int()
			.min(50)
			.max(2000)
			.default(500)
			.meta({
				description: "Meters, 50–2000",
			}),
		stops: z.coerce
			.number()
			.int()
			.min(1)
			.max(8)
			.default(4)
			.meta({
				description: "Max stops, 1–8 (each one is a request to MZK)",
			}),
		perStop: z.coerce
			.number()
			.int()
			.min(1)
			.max(30)
			.default(6)
			.meta({
				description: "Max departures per stop",
			}),
		line: zLineParam,
	}),
	async (c) => {
		const { near, radius, stops: maxStops, perStop, line } = c.req.valid("query");
		const point = parseLatLon(near);
		const gtfs = new GtfsStore(c.env.ASSETS);
		const [all, stopLines] = await Promise.all([gtfs.stops(), gtfs.stopLines()]);

		const nearest = all
			.map((s) => ({ ...s, distanceMeters: distanceMeters(point, s) }))
			.filter((s) => s.distanceMeters <= radius)
			// with a line filter, skip stops that line never serves
			.filter((s) => !line || (stopLines[s.id] ?? []).some((l) => matchesLine(line, l)))
			.sort((a, b) => a.distanceMeters - b.distanceMeters)
			.slice(0, maxStops);

		const results = await Promise.allSettled(
			nearest.map((s) => mzkClient.getDepartures({ stopId: s.id })),
		);

		return c.json({
			stops: nearest.map((s, i) => {
				const result = results[i];
				const ok = result?.status === "fulfilled";
				return {
					stop: {
						id: s.id,
						name: s.name,
						location: { x: s.lon, y: s.lat },
						distanceMeters: s.distanceMeters,
					},
					departures: ok
						? result.value.days
								.flatMap((d) => d.departures)
								.filter((d) => matchesLine(line, d.lineNumber))
								.sort((a, b) => a.secondsToDeparture - b.secondsToDeparture)
								.slice(0, perStop)
						: [],
					errorCode: ok ? null : codeOf(result?.reason),
				};
			}),
		} satisfies z.infer<typeof zNearbyResponse>);
	},
);
