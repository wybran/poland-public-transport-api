import { cors as honoCors } from "hono/cors";

export const REQUEST_HEADERS = {
	"User-Agent":
		"Non-commercial Poland Public Transport API; Contact at: https://github.com/konhi/poland-public-transport-api",
};

/** Open CORS — the API is public and keyless. */
export const cors = () => honoCors({ origin: "*", exposeHeaders: ["*"] });
