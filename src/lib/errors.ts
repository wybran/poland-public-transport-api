import type { ErrorHandler } from "hono";

/** Upstream API is down or answered with something we can't parse. → 502 */
export class UpstreamError extends Error {}

/** Requested resource doesn't exist upstream. → 404 */
export class NotFoundError extends Error {
	constructor(message = "Not found") {
		super(message);
	}
}

export const errorHandler: ErrorHandler = (err, c) => {
	if (err instanceof NotFoundError) {
		return c.json({ error: err.message }, 404);
	}
	if (err instanceof UpstreamError) {
		console.error(err.message, err.cause);
		return c.json({ error: err.message }, 502);
	}
	console.error(err);
	return c.json({ error: "Internal server error" }, 500);
};
