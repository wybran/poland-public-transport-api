import { Hono } from "hono";
import { stops } from "./routes/stops";
import { trips } from "./routes/trips";
import { vehicles } from "./routes/vehicles";

/** Zielona Góra — MZK (rj.mzk.zgora.pl). Mounted at /zg. */
export const zielonaGora = new Hono()
	.route("/vehicles", vehicles)
	.route("/stops", stops)
	.route("/trips", trips);
