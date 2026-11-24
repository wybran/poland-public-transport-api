import { Hono } from "hono";
import { registerDocs } from "./lib/docs";
import type { AppEnv } from "./lib/env";
import { errorHandler } from "./lib/errors";
import { cors } from "./lib/http";
import { annotate } from "./lib/tracing";
import { zielonaGora } from "./providers/zielona-gora";

const app = new Hono<AppEnv>();

app.use(cors());
// Optional, sent by our own apps: lets traces be filtered by app version.
// Nothing that identifies a person is recorded.
app.use(async (c, next) => {
	annotate({
		"client.app": c.req.header("X-App-Name"),
		"client.app_version": c.req.header("X-App-Version"),
	});
	await next();
});
app.onError(errorHandler);
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.route("/zg", zielonaGora);

registerDocs(app);

export default app;
