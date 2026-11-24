import { swaggerUI } from "@hono/swagger-ui";
import type { Hono } from "hono";
import type { AppEnv } from "./env";
import { openAPIRouteHandler } from "hono-openapi";

const TITLE = "Poland Public Transport API";

/** Serves the OpenAPI spec at /openapi and Swagger UI at /docs. */
export const registerDocs = (app: Hono<AppEnv>) => {
	app.get(
		"/openapi",
		openAPIRouteHandler(app, {
			documentation: {
				info: {
					title: TITLE,
					version: "1.0.0",
					description: "API for public transport in Poland",
				},
				servers: [
					{ url: "/", description: "Current server" },
					{
						url: "https://api.mzk.wybran.dev",
						description: "Production Server",
					},
				],
			},
		}),
	);

	app.get("/docs", swaggerUI({ url: "/openapi", title: TITLE }));
	app.get("/", (c) => c.redirect("/docs"));
};
