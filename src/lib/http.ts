import { cors as honoCors } from "hono/cors";
import { createMiddleware } from "hono/factory";

export const REQUEST_HEADERS = {
	"User-Agent":
		"Non-commercial Poland Public Transport API; Contact at: https://github.com/konhi/poland-public-transport-api",
};

/** How long data may be cached — by us at Cloudflare's edge and by clients. */
export const CACHE_SECONDS = {
	/** Real-time data: vehicles, departures */
	REALTIME: 10,
	/** Rarely changing data: stops, tracks */
	STATIC: 60 * 60,
} as const;

/** Open CORS — the API is public and keyless. */
export const cors = () => honoCors({ origin: "*", exposeHeaders: ["*"] });

/**
 * Sets `Cache-Control: max-age=<seconds>` on successful responses.
 * Errors are cached only briefly, so a transient 404/502 doesn't stick for an hour.
 */
export const cacheControl = (seconds: number) =>
	createMiddleware(async (c, next) => {
		await next();
		const maxAge = c.res.ok ? seconds : CACHE_SECONDS.REALTIME;
		c.header("Cache-Control", `max-age=${maxAge}`);
	});
