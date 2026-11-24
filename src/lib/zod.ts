import { z } from "zod";
import { extendZodWithOpenApi } from "zod-openapi";

// Must run once before any schema uses `.openapi()`
extendZodWithOpenApi(z);

/** Coordinates in WGS84. Shared by all providers. */
export const zLocation = z.object({
	x: z.number().openapi({ description: "Longitude" }),
	y: z.number().openapi({ description: "Latitude" }),
});

export const zErrorResponse = z.object({
	error: z.string(),
});

export { z };
