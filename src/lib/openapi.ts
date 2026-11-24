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
