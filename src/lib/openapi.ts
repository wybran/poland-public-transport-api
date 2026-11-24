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
 * Optional `?date=YYYY-MM-DD` query parameter. Defaults to today in Poland.
 */
export const dateQuery = () =>
	validator(
		"query",
		z.object({
			date: z
				.string()
				.regex(/^\d{4}-\d{2}-\d{2}$/)
				.optional()
				.openapi({
					param: { name: "date", in: "query" },
					description: "Service day, YYYY-MM-DD. Defaults to today (Europe/Warsaw).",
					example: "2026-11-24",
				}),
		}),
		(result, c) => {
			if (!result.success) {
				return c.json({ error: "Invalid date: expected YYYY-MM-DD" }, 400);
			}
		},
	);
