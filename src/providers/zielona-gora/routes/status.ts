import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { type ErrorCode, NotFoundError, UpstreamError } from "../../../lib/errors";
import { jsonResponse } from "../../../lib/openapi";
import { z } from "../../../lib/zod";
import { mzkClient } from "../client";
import { GtfsStore, httpDateToIso, todayInPoland } from "../gtfs/store";

const zErrorCode = z.string().nullable().openapi({
	description: "Error code (as in error responses) when the check failed",
});

const zStatusResponse = z.object({
	status: z.enum(["ok", "degraded"]).openapi({
		description:
			"`degraded` when live data is unavailable or today isn't covered by the timetable — show a notice in the app",
	}),
	checkedAt: z.string(),
	live: z.object({
		ok: z.boolean().openapi({ description: "MZK's live system answered" }),
		responseMs: z.number().nullable(),
		vehicles: z.number().nullable().openapi({ description: "Vehicles currently reported" }),
		errorCode: zErrorCode,
	}),
	timetable: z.object({
		ok: z.boolean().openapi({ description: "Today is covered by the timetable" }),
		version: z.string().nullable(),
		validFrom: z.string().nullable(),
		validTo: z.string().nullable(),
		publishedAt: z.string().nullable(),
		daysLeft: z.number().nullable().openapi({
			description: "Days until `validTo` (0 = last day). Warn users when it gets low.",
		}),
		errorCode: zErrorCode,
	}),
	alerts: z.object({
		count: z.number().nullable().openapi({ description: "Active announcements, see /v1/zg/alerts" }),
		errorCode: zErrorCode,
	}),
});

const codeOf = (error: unknown): ErrorCode =>
	error instanceof UpstreamError || error instanceof NotFoundError
		? error.code
		: "INTERNAL_ERROR";

const daysBetween = (from: string, to: string) =>
	Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
	);

export const status = new Hono<AppEnv>().get(
	"/",
	describeRoute({
		operationId: "getZgStatus",
		description:
			"Health of the data sources in one cheap call: is MZK's live system answering, is the timetable valid today and until when, are there announcements. Always 200 — problems are reported in the body.",
		responses: {
			200: jsonResponse(zStatusResponse, "Status"),
		},
	}),
	edgeCache(CACHE.REALTIME),
	async (c) => {
		const today = todayInPoland();
		const gtfs = new GtfsStore(c.env.ASSETS);
		const started = Date.now();

		const [live, timetable, alerts] = await Promise.allSettled([
			mzkClient.getVehicles().then((r) => ({
				ms: Date.now() - started,
				vehicles: r.vehicleList.length,
			})),
			Promise.all([gtfs.meta(), gtfs.calendar()]),
			mzkClient.getAlerts(),
		]);

		const liveOk = live.status === "fulfilled";
		const meta = timetable.status === "fulfilled" ? timetable.value[0] : undefined;
		const calendar = timetable.status === "fulfilled" ? timetable.value[1] : [];
		const todayCovered = calendar.some((d) => d.date === today);

		return c.json({
			status: liveOk && todayCovered ? "ok" : "degraded",
			checkedAt: new Date().toISOString(),
			live: {
				ok: liveOk,
				responseMs: liveOk ? live.value.ms : null,
				vehicles: liveOk ? live.value.vehicles : null,
				errorCode: liveOk ? null : codeOf(live.reason),
			},
			timetable: {
				ok: todayCovered,
				version: meta?.feedVersion ?? null,
				validFrom: meta?.validFrom ?? null,
				validTo: meta?.validTo ?? null,
				publishedAt: httpDateToIso(meta?.sourceLastModified ?? null),
				daysLeft: meta ? daysBetween(today, meta.validTo) : null,
				errorCode:
					timetable.status === "rejected"
						? codeOf(timetable.reason)
						: todayCovered
							? null
							: "DATE_OUT_OF_RANGE",
			},
			alerts: {
				count: alerts.status === "fulfilled" ? alerts.value.alerts.length : null,
				errorCode: alerts.status === "rejected" ? codeOf(alerts.reason) : null,
			},
		} satisfies z.infer<typeof zStatusResponse>);
	},
);
