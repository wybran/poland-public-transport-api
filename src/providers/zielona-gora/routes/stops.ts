import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import { errorResponses, idParam, jsonResponse } from "../../../lib/openapi";
import { mzkClient } from "../client";
import { zDeparturesResponse } from "../schema/departures";
import { zStopDetailsResponse, zStopsResponse } from "../schema/stops";

export const stops = new Hono()
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
