/**
 * Stand-in for optional packages that hono-openapi's schema converters import
 * dynamically for OTHER validation libraries (zod 3, valibot, effect, sury).
 * We only use zod 4, which is converted natively, so these code paths never run —
 * but the bundler still has to resolve the imports. See "alias" in wrangler.jsonc.
 */
export {};
