import { Hono } from "hono";
import { registerDocs } from "./lib/docs";
import type { AppEnv } from "./lib/env";
import { errorHandler } from "./lib/errors";
import { cors } from "./lib/http";
import { zielonaGora } from "./providers/zielona-gora";

const app = new Hono<AppEnv>();

app.use(cors());
app.onError(errorHandler);
app.notFound((c) => c.json({ error: "Not found" }, 404));
app.route("/zg", zielonaGora);

registerDocs(app);

export default app;
