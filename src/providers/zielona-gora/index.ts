import { Hono } from "hono";
import type { AppEnv } from "../../lib/env";
import { alerts } from "./routes/alerts";
import { planner } from "./routes/planner";
import { status } from "./routes/status";
import { stops } from "./routes/stops";
import { timetable } from "./routes/timetable";
import { trips } from "./routes/trips";
import { vehicles } from "./routes/vehicles";

/**
 * Zielona Góra — MZK. Mounted at /zg.
 * Live data: rj.mzk.zgora.pl. Scheduled timetable: MZK's GTFS feed.
 */
export const zielonaGora = new Hono<AppEnv>()
	.route("/vehicles", vehicles)
	.route("/stops", stops)
	.route("/trips", trips)
	.route("/planner", planner)
	.route("/alerts", alerts)
	.route("/status", status)
	.route("/", timetable);
