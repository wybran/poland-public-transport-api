import type { XMLParser } from "fast-xml-parser";
import wretch from "wretch";
import type { z } from "zod";
import { NotFoundError, UpstreamError } from "./errors";
import { REQUEST_HEADERS } from "./http";

type EndpointConfig<P, S extends z.ZodTypeAny> = {
	baseUrl: string;
	path: (params: P) => string;
	/** Parses the upstream body and transforms it into our response shape */
	schema: S;
} & ({ format: "json" } | { format: "xml"; xmlParser: XMLParser });

/**
 * MZK normally answers in < 1 s but sometimes hangs for 20+ s when called from
 * Cloudflare. Give up early so the edge cache can serve its stale copy instead.
 */
const UPSTREAM_TIMEOUT_MS = 8_000;

// Note: no in-memory sharing of in-flight requests between clients. In Workers
// a fetch belongs to the request that started it; when that client disconnects
// the fetch is cancelled and every other request awaiting it fails with a 500.
const fetchText = (url: string): Promise<string> =>
	wretch(url)
		.headers(REQUEST_HEADERS)
		.options({ signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) })
		.get()
		.text()
		.catch((error: unknown) => {
			const timedOut =
				error instanceof Error &&
				(error.name === "TimeoutError" || error.name === "AbortError");
			throw new UpstreamError(
				timedOut
					? `Upstream timed out after ${UPSTREAM_TIMEOUT_MS / 1000}s: ${url}`
					: `Upstream request failed: ${url}`,
				{ cause: error },
			);
		});

/**
 * Builds a typed function that fetches an upstream endpoint,
 * parses it (XML or JSON) and validates/transforms it with the given schema.
 *
 * Throws `NotFoundError` on an empty body and `UpstreamError` on anything
 * unexpected — both are turned into JSON responses by `errorHandler`.
 */
export const createEndpoint =
	<P = void, S extends z.ZodTypeAny = z.ZodTypeAny>(
		config: EndpointConfig<P, S>,
	) =>
	async (params: P): Promise<z.output<S>> => {
		const url = `${config.baseUrl}${config.path(params)}`;

		const text = await fetchText(url);

		// Upstreams tend to answer unknown ids with an empty body (200/204)
		if (text.trim() === "") {
			throw new NotFoundError();
		}

		let raw: unknown;
		try {
			raw =
				config.format === "xml"
					? config.xmlParser.parse(text)
					: JSON.parse(text);
		} catch (error) {
			throw new UpstreamError(`Unparsable upstream response: ${url}`, {
				cause: error,
			});
		}

		const result = config.schema.safeParse(raw);
		if (!result.success) {
			throw new UpstreamError(`Unexpected upstream response: ${url}`, {
				cause: result.error,
			});
		}
		return result.data;
	};
