import type { XMLParser } from "fast-xml-parser";
import wretch from "wretch";
import type { z } from "zod";
import { NotFoundError, UpstreamError } from "./errors";
import { REQUEST_HEADERS } from "./http";

type EndpointConfig<P, S extends z.ZodTypeAny> = {
	baseUrl: string;
	path: (params: P) => string;
	/** Edge cache TTL for the upstream response */
	cacheSeconds: number;
	/** Parses the upstream body and transforms it into our response shape */
	schema: S;
} & ({ format: "json" } | { format: "xml"; xmlParser: XMLParser });

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

		let text: string;
		try {
			text = await wretch(url)
				.headers(REQUEST_HEADERS)
				// `cf` is a Workers fetch option, not a header
				.options({
					cf: { cacheEverything: true, cacheTtl: config.cacheSeconds },
				})
				.get()
				.text();
		} catch (error) {
			throw new UpstreamError(`Upstream request failed: ${url}`, {
				cause: error,
			});
		}

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
