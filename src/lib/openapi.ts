import { resolver, validator } from "hono-openapi/zod";
import { z, zErrorResponse } from "./zod";

/** OpenAPI response object for a JSON body described by a Zod schema. */
export const jsonResponse = (schema: z.ZodTypeAny, description: string) => ({
	description,
	content: { "application/json": { schema: resolver(schema) } },
});

export const errorResponses = {
	400: jsonResponse(zErrorResponse, "Invalid parameters"),
	404: jsonResponse(zErrorResponse, "Not found"),
	502: jsonResponse(
		zErrorResponse,
		"Upstream API is unavailable or changed its format",
	),
};

const zId = (name: string) =>
	z.coerce
		.number()
		.int()
		.positive()
		.openapi({ param: { name, in: "path" } });

/**
 * Validates a numeric path parameter and documents it in OpenAPI.
 * Responds 400 `{ error }` when it isn't a positive integer.
 */
export const idParam = <K extends string>(name: K) =>
	validator(
		"param",
		z.object({ [name]: zId(name) } as Record<K, ReturnType<typeof zId>>),
		(result, c) => {
			if (!result.success) {
				return c.json(
					{ error: `Invalid ${name}: must be a positive integer` },
					400,
				);
			}
		},
	);

/**
 * Validates a short alphanumeric path parameter (e.g. line "N1", shape "538510").
 */
export const slugParam = <K extends string>(name: K) =>
	validator(
		"param",
		z.object({
			[name]: z
				.string()
				.regex(/^[A-Za-z0-9_-]{1,32}$/)
				.openapi({ param: { name, in: "path" } }),
		} as Record<K, z.ZodString>),
		(result, c) => {
			if (!result.success) {
				return c.json({ error: `Invalid ${name}` }, 400);
			}
		},
	);

/**
 * Validates all query parameters of a route with ONE validator — Hono keeps
 * only the last validator's output per target, so two `validator("query")`
 * middlewares would silently drop each other's fields.
 * Responds 400 `{ error }` naming the first invalid parameter.
 */
export const query = <T extends z.ZodRawShape>(shape: T) =>
	validator("query", z.object(shape), (result, c) => {
		if (!result.success) {
			const issue = result.error.issues[0];
			return c.json(
				{ error: `Invalid ${issue?.path.join(".") ?? "query"}: ${issue?.message}` },
				400,
			);
		}
	});

/** Optional `?date=YYYY-MM-DD`. Defaults to today in Poland (resolved by the route). */
export const zDateParam = z
	.string()
	.regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
	.optional()
	.openapi({
		param: { name: "date", in: "query" },
		description: "Service day, YYYY-MM-DD. Defaults to today (Europe/Warsaw).",
		example: "2026-11-24",
	});

/** Parsed `?line=` value: upper-cased line numbers, or undefined when not given. */
export type LineFilter = Set<string> | undefined;

/** Optional `?line=27` or `?line=27,14,N1` (case-insensitive). */
export const zLineParam = z
	.string()
	.regex(
		/^[A-Za-z0-9]{1,8}(,[A-Za-z0-9]{1,8}){0,49}$/,
		"expected e.g. 27 or 27,14,N1",
	)
	.optional()
	.transform(
		(v): LineFilter =>
			v ? new Set(v.split(",").map((l) => l.toUpperCase())) : undefined,
	)
	.openapi({
		param: { name: "line", in: "query" },
		description: "Only these lines, comma-separated, e.g. `27` or `27,14,N1`",
		example: "27",
	});

export const matchesLine = (filter: LineFilter, lineNumber: string) =>
	!filter || filter.has(lineNumber.toUpperCase());
