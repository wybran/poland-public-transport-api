import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";
import { ERROR_CODES } from "./errors";

// Must run once before any schema uses `.openapi()`
extendZodWithOpenApi(z);

/** Coordinates in WGS84. Shared by all providers. */
export const zLocation = z.object({
	x: z.number().openapi({ description: "Longitude" }),
	y: z.number().openapi({ description: "Latitude" }),
});

export const zErrorResponse = z.object({
	error: z.string().openapi({ description: "English hint for developers — don't show it to users" }),
	code: z.enum(ERROR_CODES).openapi({
		description: "Stable error code — switch on this and show your own (translated) message",
	}),
	param: z.string().optional().openapi({ description: "Invalid parameter, for INVALID_PARAMETER" }),
});

export { z };
