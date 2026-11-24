import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE_SECONDS, cacheControl } from "../../../lib/http";
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
		cacheControl(CACHE_SECONDS.STATIC),
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
		cacheControl(CACHE_SECONDS.STATIC),
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
		cacheControl(CACHE_SECONDS.REALTIME),
		idParam("stopId"),
		async (c) => {
			const { stopId } = c.req.valid("param");
			return c.json(await mzkClient.getDepartures({ stopId }));
		},
	);
