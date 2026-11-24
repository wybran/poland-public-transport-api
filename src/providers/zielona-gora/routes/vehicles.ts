import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import {
	errorResponses,
	idParam,
	jsonResponse,
	matchesLine,
	query,
	zLineParam,
} from "../../../lib/openapi";
import { mzkClient } from "../client";
import { zVehicleTimetableResponse } from "../schema/vehicle-timetable";
import { zVehiclesResponse } from "../schema/vehicles";

export const vehicles = new Hono()
	.use(edgeCache(CACHE.REALTIME))

	.get(
		"/",
		describeRoute({
			operationId: "getZgVehicles",
			description:
				"Vehicles on the road. Use `?line=27` (or `27,14`) to get only some lines — much smaller response.",
			responses: {
				200: jsonResponse(
					zVehiclesResponse,
					"List of vehicles with their current status and location",
				),
				400: errorResponses[400],
				502: errorResponses[502],
			},
		}),
		query({ line: zLineParam }),
		async (c) => {
			const { line } = c.req.valid("query");
			// Always fetch all vehicles (one shared upstream response) and filter here:
			// MZK's own filter takes a single line only and would multiply upstream calls.
			const { vehicleList } = await mzkClient.getVehicles();
			return c.json({
				vehicleList: vehicleList.filter((v) => matchesLine(line, v.lineNumber)),
			});
		},
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
