import type { Context, ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Stable, machine-readable error codes. Apps should switch on `code` (and
 * show their own, translated message); `error` is an English hint for humans.
 * Never rename or remove a code — only add new ones.
 */
export const ERROR_CODES = [
	// 400
	"INVALID_PARAMETER",
	// 404
	"ROUTE_NOT_FOUND", // unknown URL
	"NOT_FOUND", // unknown id in MZK's data (stop, vehicle, alert, …)
	"STOP_NOT_FOUND",
	"TRIP_NOT_FOUND",
	"COURSE_NOT_RUNNING", // course doesn't run on the requested date
	"DATE_OUT_OF_RANGE", // date outside the published timetable
	"NO_CONNECTION", // planner found nothing
	// 502
	"UPSTREAM_TIMEOUT", // MZK didn't answer in time
	"UPSTREAM_ERROR", // MZK failed or changed its format
	"TIMETABLE_UNAVAILABLE", // GTFS data missing on our side
	// 500
	"INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorBody = {
	error: string;
	code: ErrorCode;
	/** Name of the invalid parameter, for INVALID_PARAMETER */
	param?: string;
};

type NotFoundCode = Extract<
	ErrorCode,
	| "NOT_FOUND"
	| "STOP_NOT_FOUND"
	| "TRIP_NOT_FOUND"
	| "COURSE_NOT_RUNNING"
	| "DATE_OUT_OF_RANGE"
	| "NO_CONNECTION"
>;

type UpstreamCode = Extract<
	ErrorCode,
	"UPSTREAM_TIMEOUT" | "UPSTREAM_ERROR" | "TIMETABLE_UNAVAILABLE"
>;

/** Upstream API is down or answered with something we can't parse. → 502 */
export class UpstreamError extends Error {
	readonly code: UpstreamCode;
	constructor(
		message: string,
		options: { cause?: unknown; code?: UpstreamCode } = {},
	) {
		super(message, { cause: options.cause });
		this.code = options.code ?? "UPSTREAM_ERROR";
	}
}

/** Requested resource doesn't exist. → 404 */
export class NotFoundError extends Error {
	readonly code: NotFoundCode;
	constructor(message = "Not found", code: NotFoundCode = "NOT_FOUND") {
		super(message);
		this.code = code;
	}
}

/** JSON error response in the one shape every route uses. */
export const errorResponse = (
	c: Context,
	status: ContentfulStatusCode,
	body: ErrorBody,
) => c.json(body, status);

export const errorHandler: ErrorHandler = (err, c) => {
	if (err instanceof NotFoundError) {
		return errorResponse(c, 404, { error: err.message, code: err.code });
	}
	if (err instanceof UpstreamError) {
		console.error(err.message, err.cause);
		return errorResponse(c, 502, { error: err.message, code: err.code });
	}
	console.error(err);
	return errorResponse(c, 500, {
		error: "Internal server error",
		code: "INTERNAL_ERROR",
	});
};
