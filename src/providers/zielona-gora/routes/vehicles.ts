import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE_SECONDS, cacheControl } from "../../../lib/http";
import { errorResponses, idParam, jsonResponse } from "../../../lib/openapi";
import { mzkClient } from "../client";
import { zVehicleTimetableResponse } from "../schema/vehicle-timetable";
import { zVehiclesResponse } from "../schema/vehicles";

export const vehicles = new Hono()
	.use(cacheControl(CACHE_SECONDS.REALTIME))

	.get(
		"/",
		describeRoute({
			operationId: "getZgVehicles",
			description: "Get list of vehicles",
			responses: {
				200: jsonResponse(
					zVehiclesResponse,
					"List of vehicles with their current status and location",
				),
				502: errorResponses[502],
			},
		}),
		async (c) => c.json(await mzkClient.getVehicles()),
	)

	.get(
		"/:vehicleNumber/timetable",
		describeRoute({
			operationId: "getZgVehicleTimetable",
			description:
				"Upcoming stops of the vehicle's current course. `vehicleNumber` is `vehicleId` from /zg/vehicles.",
			responses: {
				200: jsonResponse(zVehicleTimetableResponse, "Upcoming stops with ETA"),
				...errorResponses,
			},
		}),
		idParam("vehicleNumber"),
		async (c) => {
			const { vehicleNumber } = c.req.valid("param");
			return c.json(await mzkClient.getVehicleTimetable({ vehicleNumber }));
		},
	);
