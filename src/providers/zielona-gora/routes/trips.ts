import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { NotFoundError } from "../../../lib/errors";
import { CACHE, edgeCache } from "../../../lib/cache";
import { errorResponses, idParam, jsonResponse } from "../../../lib/openapi";
import { mzkClient } from "../client";
import { zTripTrackResponse } from "../schema/trip-track";

export const trips = new Hono().get(
	"/:tripId/track",
	describeRoute({
		operationId: "getZgTripTrack",
		description:
			"Stops, times and map path of a trip (trip ids come from the MZK trip planner)",
		responses: {
			200: jsonResponse(zTripTrackResponse, "Trip track"),
			...errorResponses,
		},
	}),
	edgeCache(CACHE.STATIC),
	idParam("tripId"),
	async (c) => {
		const { tripId } = c.req.valid("param");
		const track = await mzkClient.getTripTrack({ tripId });
		if (!track) throw new NotFoundError("Trip not found");
		return c.json(track);
	},
);
