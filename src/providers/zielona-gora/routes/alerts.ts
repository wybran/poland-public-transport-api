import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { errorResponses, idParam, jsonResponse } from "../../../lib/openapi";
import { mzkClient } from "../client";
import { htmlToText, zAlertResponse, zAlertsResponse } from "../schema/alerts";

export const alerts = new Hono<AppEnv>()
	.use(edgeCache(CACHE.ALERTS))

	.get(
		"/",
		describeRoute({
			operationId: "getZgAlerts",
			description:
				"Current MZK announcements (the scrolling bar on rj.mzk.zgora.pl): detours, timetable changes. Empty when there are none.",
			responses: {
				200: jsonResponse(zAlertsResponse, "Announcements"),
				502: errorResponses[502],
			},
		}),
		async (c) => c.json(await mzkClient.getAlerts()),
	)

	.get(
		"/:alertId",
		describeRoute({
			operationId: "getZgAlert",
			description:
				"Full text of a dispatcher message, e.g. one linked from a stop's `dispatchMessage` in /zg/stops/{stopId}/departures.",
			responses: {
				200: jsonResponse(zAlertResponse, "Announcement"),
				...errorResponses,
			},
		}),
		idParam("alertId"),
		async (c) => {
			const { alertId } = c.req.valid("param");
			const [{ type, title }, html] = await Promise.all([
				mzkClient.getAlertTitle({ id: alertId }),
				mzkClient.getAlertHtml({ id: alertId }),
			]);
			return c.json({ id: alertId, type, title, text: htmlToText(html), html });
		},
	);
