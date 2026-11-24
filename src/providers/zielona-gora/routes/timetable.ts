import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { NotFoundError } from "../../../lib/errors";
import {
	dateQuery,
	errorResponses,
	idParam,
	jsonResponse,
	slugParam,
} from "../../../lib/openapi";
import {
	GtfsStore,
	normalizeTime,
	todayInPoland,
	toPath,
} from "../gtfs/store";
import {
	zCalendarResponse,
	zCourseResponse,
	zLineResponse,
	zLinesResponse,
	zScheduleResponse,
	zShapeResponse,
} from "../schema/timetable";

/**
 * Scheduled timetable from MZK's GTFS feed (refreshed daily, see scripts/gtfs).
 * Complements the live routes: courseId and stop ids are the same in both.
 */
export const timetable = new Hono<AppEnv>()
	.get(
		"/calendar",
		describeRoute({
			operationId: "getZgCalendar",
			description: "Days covered by the timetable and the day type of each",
			responses: {
				200: jsonResponse(zCalendarResponse, "Timetable validity and day types"),
				502: errorResponses[502],
			},
		}),
		edgeCache(CACHE.DAILY),
		async (c) => {
			const gtfs = new GtfsStore(c.env.ASSETS);
			const [meta, days] = await Promise.all([gtfs.meta(), gtfs.calendar()]);
			return c.json({
				feed: {
					publisher: meta.publisher,
					version: meta.feedVersion,
					validFrom: meta.validFrom,
					validTo: meta.validTo,
					generatedAt: meta.generatedAt,
				},
				days: days.map(({ date, dayType, serviceId }) => ({
					date,
					dayType,
					serviceId,
				})),
			});
		},
	)

	.get(
		"/lines",
		describeRoute({
			operationId: "getZgLines",
			description: "All lines",
			responses: {
				200: jsonResponse(zLinesResponse, "Lines"),
				502: errorResponses[502],
			},
		}),
		edgeCache(CACHE.DAILY),
		async (c) => c.json({ lines: await new GtfsStore(c.env.ASSETS).lines() }),
	)

	.get(
		"/lines/:lineId",
		describeRoute({
			operationId: "getZgLine",
			description: "Line with its route variants (stop sequences) per direction",
			responses: {
				200: jsonResponse(zLineResponse, "Line details"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.DAILY),
		slugParam("lineId"),
		async (c) => {
			const { lineId } = c.req.valid("param");
			return c.json(await new GtfsStore(c.env.ASSETS).line(lineId));
		},
	)

	.get(
		"/stops/:stopId/schedule",
		describeRoute({
			operationId: "getZgStopSchedule",
			description: "Full-day scheduled departures from a stop",
			responses: {
				200: jsonResponse(zScheduleResponse, "Departures for the day"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.DAILY),
		idParam("stopId"),
		dateQuery(),
		async (c) => {
			const { stopId } = c.req.valid("param");
			const date = c.req.valid("query").date ?? todayInPoland();
			const gtfs = new GtfsStore(c.env.ASSETS);

			const [days, stops, lines] = await Promise.all([
				gtfs.servicesOn(date),
				gtfs.stops(),
				gtfs.lines(),
			]);
			const stop = stops.find((s) => s.id === stopId);
			if (!stop) throw new NotFoundError("Stop not found");

			const lineName = new Map(lines.map((l) => [l.id, l.name]));
			const departures = (
				await Promise.all(days.map((d) => gtfs.stopSchedule(d.serviceId, stopId)))
			)
				.flat()
				.sort((a, b) => a.time.localeCompare(b.time));

			return c.json({
				date,
				dayTypes: days.map((d) => d.dayType),
				stop: { id: stop.id, name: stop.name },
				departures: departures.map((d) => ({
					...normalizeTime(d.time),
					lineNumber: lineName.get(d.lineId) ?? d.lineId,
					headsign: d.headsign,
					courseId: d.courseId,
					onRequest: d.onRequest,
					dropOffOnly: d.dropOffOnly,
				})),
			});
		},
	)

	.get(
		"/courses/:courseId",
		describeRoute({
			operationId: "getZgCourse",
			description:
				"Scheduled course (kurs): all stops with times and route geometry. `courseId` comes from /zg/vehicles, departures or schedules.",
			responses: {
				200: jsonResponse(zCourseResponse, "Course"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.DAILY),
		idParam("courseId"),
		dateQuery(),
		async (c) => {
			const { courseId } = c.req.valid("param");
			const date = c.req.valid("query").date ?? todayInPoland();
			const gtfs = new GtfsStore(c.env.ASSETS);

			const days = await gtfs.servicesOn(date);
			for (const day of days) {
				const trip = await gtfs.trip(day.version, courseId);
				if (!trip || trip.serviceId !== day.serviceId) continue;

				const [lines, shape] = await Promise.all([
					gtfs.lines(),
					trip.shapeId ? gtfs.shape(trip.shapeId).catch(() => []) : [],
				]);

				return c.json({
					date,
					dayType: day.dayType,
					courseId: trip.courseId,
					lineNumber:
						lines.find((l) => l.id === trip.lineId)?.name ?? trip.lineId,
					headsign: trip.headsign,
					directionId: trip.directionId,
					shapeId: trip.shapeId,
					stops: trip.stops.map((s, i) => ({
						sequence: i + 1,
						id: s.id,
						name: s.name,
						arrival: normalizeTime(s.arrival),
						departure: normalizeTime(s.departure),
						onRequest: s.onRequest,
						noPickup: s.noPickup,
						noDropOff: s.noDropOff,
					})),
					path: toPath(shape),
				});
			}
			throw new NotFoundError(`Course ${courseId} doesn't run on ${date}`);
		},
	)

	.get(
		"/shapes/:shapeId",
		describeRoute({
			operationId: "getZgShape",
			description: "Route geometry for a shapeId from /zg/lines/{lineId}",
			responses: {
				200: jsonResponse(zShapeResponse, "Polyline"),
				...errorResponses,
			},
		}),
		edgeCache(CACHE.DAILY),
		slugParam("shapeId"),
		async (c) => {
			const { shapeId } = c.req.valid("param");
			const shape = await new GtfsStore(c.env.ASSETS).shape(shapeId);
			return c.json({ id: shapeId, path: toPath(shape) });
		},
	);
