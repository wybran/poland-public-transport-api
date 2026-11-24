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
import { z } from "../../../lib/zod";
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
				"Vehicles on the road. Filters (combinable): `?line=27` (or `27,14`), `?vehicle=328` (vehicleId / `vehicleNumber` from departures), `?courseId=2421` (from departures or schedules). Filtered responses are much smaller.",
			responses: {
				200: jsonResponse(
					zVehiclesResponse,
					"List of vehicles with their current status and location",
				),
				400: errorResponses[400],
				502: errorResponses[502],
			},
		}),
		query({
			line: zLineParam,
			vehicle: z
				.string()
				.regex(/^\d{1,6}(,\d{1,6}){0,49}$/, "expected e.g. 328 or 328,344")
				.optional()
				.transform((v) => (v ? new Set(v.split(",").map(Number)) : undefined))
				.meta({
					description: "Vehicle ids (side numbers), comma-separated",
					example: "328",
				}),
			courseId: z.coerce
				.number()
				.int()
				.positive()
				.optional()
				.meta({
					description: "The vehicle currently running this course",
					example: 2421,
				}),
		}),
		async (c) => {
			const { line, vehicle, courseId } = c.req.valid("query");
			// Always fetch all vehicles (one shared upstream response) and filter here:
			// MZK's own filter takes a single line only and would multiply upstream calls.
			const { vehicleList } = await mzkClient.getVehicles();
			return c.json({
				vehicleList: vehicleList.filter(
					(v) =>
						matchesLine(line, v.lineNumber) &&
						(!vehicle || vehicle.has(v.vehicleId)) &&
						(courseId === undefined || v.courseId === courseId),
				),
			});
		},
	)

	.get(
		"/:vehicleNumber/timetable",
		describeRoute({
			operationId: "getZgVehicleTimetable",
			description:
				"Upcoming stops of the vehicle's current course. `vehicleNumber` is `vehicleId` from /v1/zg/vehicles.",
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
