import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

export type CachePolicy = {
	/** Seconds a response is served from cache without asking upstream. */
	ttl: number;
	/** Seconds a response is kept as a fallback for when upstream fails. */
	staleTtl: number;
};

export const CACHE = {
	/** Real-time data: vehicles, departures. Fallback for 5 min if MZK is down. */
	REALTIME: { ttl: 10, staleTtl: 5 * 60 },
	/** Rarely changing data: stops, tracks. Fallback for a day. */
	STATIC: { ttl: 60 * 60, staleTtl: 24 * 60 * 60 },
} as const satisfies Record<string, CachePolicy>;

/** How long clients may cache errors and stale fallbacks. */
const ERROR_MAX_AGE = 10;

const CACHED_AT_HEADER = "X-Cached-At";

/** Response headers exposed to clients. */
export const CACHE_STATUS_HEADER = "X-Cache"; // HIT | MISS | STALE | BYPASS
export const DATA_AGE_HEADER = "X-Data-Age"; // seconds since data was fetched from upstream

/** `caches.default` is missing outside Workers (e.g. unit tests). */
const getCache = (): Cache | undefined =>
	typeof caches === "undefined" ? undefined : caches.default;

const waitUntil = (c: Context, promise: Promise<unknown>) => {
	try {
		c.executionCtx.waitUntil(promise);
	} catch {
		// No ExecutionContext (tests) — let it run unattended
	}
};

const ageOf = (res: Response) =>
	Math.max(
		0,
		Math.floor(
			(Date.now() - Number(res.headers.get(CACHED_AT_HEADER) ?? 0)) / 1000,
		),
	);

/** Copy of a cached response with client-facing headers. */
const serveCached = (
	cached: Response,
	status: "HIT" | "STALE",
	maxAge: number,
) => {
	const res = new Response(cached.body, cached);
	res.headers.delete(CACHED_AT_HEADER);
	res.headers.set(CACHE_STATUS_HEADER, status);
	res.headers.set(DATA_AGE_HEADER, String(ageOf(cached)));
	res.headers.set("Cache-Control", `max-age=${maxAge}`);
	return res;
};

/**
 * Caches the route's JSON response in Cloudflare's edge cache (per data center).
 *
 * - fresh (< ttl)          → served from cache, handler and upstream are skipped
 * - expired / missing      → handler runs, a 200 response is stored for `staleTtl`
 * - handler fails with 5xx → last good response is served (X-Cache: STALE)
 *
 * We cache our own response rather than the upstream one, because MZK sends
 * `no-store` and `Set-Cookie`, which keep Cloudflare from caching it.
 */
export const edgeCache = (policy: CachePolicy) =>
	createMiddleware(async (c, next) => {
		const cache = getCache();
		if (!cache || c.req.method !== "GET") {
			await next();
			c.header(CACHE_STATUS_HEADER, "BYPASS");
			return;
		}

		const key = new Request(c.req.url, { method: "GET" });
		const cached = await cache.match(key);

		if (cached) {
			const age = ageOf(cached);
			if (age < policy.ttl) {
				return serveCached(cached, "HIT", policy.ttl - age);
			}
		}

		await next();

		if (c.res.status === 200) {
			const toStore = new Response(c.res.clone().body, c.res);
			toStore.headers.set(CACHED_AT_HEADER, String(Date.now()));
			// Controls how long Cloudflare keeps it, not what clients see
			toStore.headers.set("Cache-Control", `public, max-age=${policy.staleTtl}`);
			waitUntil(c, cache.put(key, toStore));

			c.header(CACHE_STATUS_HEADER, "MISS");
			c.header(DATA_AGE_HEADER, "0");
			c.header("Cache-Control", `max-age=${policy.ttl}`);
			return;
		}

		if (c.res.status >= 500 && cached) {
			c.res = serveCached(cached, "STALE", ERROR_MAX_AGE);
			return;
		}

		// 4xx, or 5xx with nothing to fall back to
		c.header("Cache-Control", `max-age=${ERROR_MAX_AGE}`);
	});
