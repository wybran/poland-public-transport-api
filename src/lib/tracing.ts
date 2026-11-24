import { tracing } from "cloudflare:workers";

/**
 * Adds attributes to the current request's trace span (Workers Observability).
 * No-op when tracing is off. We deliberately record no user/session ids —
 * the API is public and keyless, so there is nothing to tie requests to.
 */
export const annotate = (
	attributes: Record<string, boolean | number | string | undefined>,
) => {
	try {
		tracing.getActiveSpan()?.setAttributes(attributes);
	} catch {
		// tracing unavailable (e.g. older runtime) — never fail a request over it
	}
};
