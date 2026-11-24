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
 * Requests to the same URL that are in flight right now. When the cache expires
 * and many clients ask at once, they share a single upstream request.
 * Scope: one Worker isolate (an isolate serves many concurrent requests).
 */
const inFlight = new Map<string, Promise<string>>();

const fetchText = (url: string): Promise<string> => {
	const pending = inFlight.get(url);
	if (pending) return pending;

	const request = wretch(url)
		.headers(REQUEST_HEADERS)
		.get()
		.text()
		.catch((error: unknown) => {
			throw new UpstreamError(`Upstream request failed: ${url}`, {
				cause: error,
			});
		})
		.finally(() => inFlight.delete(url));

	inFlight.set(url, request);
	return request;
};

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
