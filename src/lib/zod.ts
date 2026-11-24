import { z } from "zod";
import { ERROR_CODES } from "./errors";

// OpenAPI descriptions/examples are attached with zod 4's `.meta({...})`;
// hono-openapi turns schemas into JSON Schema with `z.toJSONSchema`.

/** Coordinates in WGS84. Shared by all providers. */
export const zLocation = z.object({
	x: z.number().meta({ description: "Longitude" }),
	y: z.number().meta({ description: "Latitude" }),
});

export const zErrorResponse = z.object({
	error: z.string().meta({ description: "English hint for developers — don't show it to users" }),
	code: z.enum(ERROR_CODES).meta({
		description: "Stable error code — switch on this and show your own (translated) message",
	}),
	param: z.string().optional().meta({ description: "Invalid parameter, for INVALID_PARAMETER" }),
});

export { z };
