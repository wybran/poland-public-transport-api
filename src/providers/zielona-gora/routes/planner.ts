import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { NotFoundError } from "../../../lib/errors";
import {
	errorResponses,
	jsonResponse,
	query,
	zDateParam,
} from "../../../lib/openapi";
import { z } from "../../../lib/zod";
import { mzkClient } from "../client";
import { GtfsStore, todayInPoland } from "../gtfs/store";
import { parsePlannerResponse, zPlannerResponse } from "../schema/planner";

/** `51.9358,15.4960` (lat,lon) or a stop id like `6`. */
const zPoint = (name: "from" | "to", example: string) =>
	z
		.string()
		.regex(
			/^(\d+|-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?)$/,
			"expected a stop id (e.g. 6) or lat,lon (e.g. 51.9358,15.4960)",
		)
		.openapi({
			param: { name, in: "query", required: true },
			description: "Stop id or `lat,lon`",
			example,
		});

const nowInPoland = () =>
	new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Warsaw",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date());

const zBool = z
	.enum(["true", "false", "1", "0"])
	.optional()
	.transform((v) => v === "true" || v === "1");

export const planner = new Hono<AppEnv>().get(
	"/",
	describeRoute({
		operationId: "getZgPlanner",
		description:
			"Trip planner (MZK's journey planner): connections between two stops or coordinates, with walking, transfers, times and map paths.",
		responses: {
			200: jsonResponse(zPlannerResponse, "Connections, best first"),
			...errorResponses,
		},
	}),
	edgeCache(CACHE.REALTIME),
	query({
		from: zPoint("from", "6"),
		to: zPoint("to", "51.9332,15.5866"),
		date: zDateParam,
		time: z
			.string()
			.regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM")
			.optional()
			.openapi({
				param: { name: "time", in: "query" },
				description: "Departure time HH:MM, defaults to now (Europe/Warsaw)",
				example: "10:00",
			}),
		maxTransfers: z.coerce
			.number()
			.int()
			.min(0)
			.max(4)
			.default(4)
			.openapi({
				param: { name: "maxTransfers", in: "query" },
				description: "0–4 (4 = no limit, MZK's default)",
			}),
		walk: z.coerce
			.number()
			.int()
			.min(0)
			.max(2)
			.default(1)
			.openapi({
				param: { name: "walk", in: "query" },
				description: "How far you're willing to walk: 0 = short, 1 = normal, 2 = long",
			}),
		lowFloor: zBool.openapi({
			param: { name: "lowFloor", in: "query" },
			description: "`true`: low-floor vehicles only",
		}),
	}),
	async (c) => {
		const q = c.req.valid("query");
		const date = q.date ?? todayInPoland();

		const stops = new GtfsStore(c.env.ASSETS);
		const resolve = async (point: string) => {
			const [lat, lon] = point.split(",").map(Number);
			if (lon !== undefined && lat !== undefined && point.includes(",")) {
				return { lat, lon };
			}
			const stop = (await stops.stops()).find((s) => s.id === Number(point));
			if (!stop) throw new NotFoundError(`Stop ${point} not found`, "STOP_NOT_FOUND");
			return { lat: stop.lat, lon: stop.lon };
		};

		const [from, to] = await Promise.all([resolve(q.from), resolve(q.to)]);
		const text = await mzkClient.searchConnections({
			from,
			to,
			date,
			time: q.time ?? nowInPoland(),
			maxTransfers: q.maxTransfers,
			walk: q.walk as 0 | 1 | 2,
			lowFloor: q.lowFloor,
		});

		const result = parsePlannerResponse(text, date);
		if (result.connections.length === 0) {
			// MZK answers [] for dates outside its timetable too — say which it is
			await stops.servicesOn(date);
			throw new NotFoundError(
				"No connection found — try a different time, more transfers or a longer walk",
				"NO_CONNECTION",
			);
		}
		return c.json(result);
	},
);
