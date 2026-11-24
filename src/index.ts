import { Hono } from "hono";
import { registerDocs } from "./lib/docs";
import type { AppEnv } from "./lib/env";
import { errorHandler, errorResponse } from "./lib/errors";
import { cors } from "./lib/http";
import { annotate } from "./lib/tracing";
import { zielonaGora } from "./providers/zielona-gora";

const app = new Hono<AppEnv>();

app.use(cors());
app.use(async (c, next) => {
	annotate({
		"client.app": c.req.header("X-App-Name"),
		"client.app_version": c.req.header("X-App-Version"),
	});
	await next();
});
app.onError(errorHandler);
app.notFound((c) =>
	errorResponse(c, 404, { error: "Unknown route", code: "ROUTE_NOT_FOUND" }),
);
app.route("/v1/zg", zielonaGora);
app.all("/zg/*", async (c) => {
	const url = new URL(c.req.url);
	url.pathname = `/v1${url.pathname}`;
	const res = await app.fetch(new Request(url, c.req.raw), c.env, c.executionCtx);
	const out = new Response(res.body, res);
	out.headers.set("Deprecation", "true");
	out.headers.set("Link", `<${url.pathname}>; rel="successor-version"`);
	return out;
});

registerDocs(app);

export default app;
