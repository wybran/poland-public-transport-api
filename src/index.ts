import { Hono } from "hono";
import { registerDocs } from "./lib/docs";
import { errorHandler } from "./lib/errors";
import { cors } from "./lib/http";
import { zielonaGora } from "./providers/zielona-gora";

const app = new Hono();

app.use(cors());
app.onError(errorHandler);
app.route("/zg", zielonaGora);

registerDocs(app);

export default app;
