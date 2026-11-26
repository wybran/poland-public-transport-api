/** Hono environment shared by every router: Worker bindings from wrangler.jsonc. */
export type AppEnv = {
	Bindings: Cloudflare.Env & {
		/** LocationIQ access token for /geocode — a secret (`.dev.vars` locally, `wrangler secret put` in production). */
		LOCATIONIQ_TOKEN?: string;
	};
};
