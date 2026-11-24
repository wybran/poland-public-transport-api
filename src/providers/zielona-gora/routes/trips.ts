import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { NotFoundError } from "../../../lib/errors";
import { CACHE, edgeCache } from "../../../lib/cache";
import {
	errorResponses,
	idParam,
	jsonResponse,
	query,
} from "../../../lib/openapi";
import { z } from "../../../lib/zod";
import { mzkClient } from "../client";
import { zTripTrackResponse } from "../schema/trip-track";

export const trips = new Hono().get(
	"/:tripId/track",
	describeRoute({
		operationId: "getZgTripTrack",
		description:
			"Stops, times and map path of a trip. `tripId` and `timetableId` come from a bus leg of /v1/zg/planner.",
		responses: {
			200: jsonResponse(zTripTrackResponse, "Trip track"),
			...errorResponses,
		},
	}),
	edgeCache(CACHE.STATIC),
	idParam("tripId"),
	query({
		timetableId: z.coerce
			.number()
			.int()
			.nonnegative()
			.default(0)
			.openapi({
				param: { name: "timetableId", in: "query" },
				description: "`timetableId` of the planner leg; optional for courses running today",
				example: 7387,
			}),
	}),
	async (c) => {
		const { tripId } = c.req.valid("param");
		const { timetableId } = c.req.valid("query");
		const track = await mzkClient.getTripTrack({ tripId, timetableId });
		if (!track) throw new NotFoundError("Trip not found", "TRIP_NOT_FOUND");
		return c.json(track);
	},
);
