import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { UpstreamError } from "../../../lib/errors";
import { errorResponses, jsonResponse, query } from "../../../lib/openapi";
import { z, zLocation } from "../../../lib/zod";

/** Zielona Góra with its villages (lon, lat). Results outside are dropped by LocationIQ (`bounded=1`). */
const VIEWBOX = "15.35,51.85,15.65,52.05";
const TIMEOUT_MS = 5000;
/** Stops come from MZK's own data; the rest is noise when looking for where to go. */
const SKIP = /^(highway\/bus_stop|public_transport\/|railway\/(tram_)?stop|emergency\/|information\/|amenity\/(toilets|bench|waste_basket))/;

const zGeocodeResponse = z.object({
	places: z.array(
		z.object({
			name: z.string().meta({ description: "Street with house number, or the place's name", example: "Wrocławska 12" }),
			detail: z.string().meta({ description: "Where it is: street of a named place, district", example: "Stare Miasto" }),
			kind: z.string().meta({ description: "OSM class/type, e.g. `highway/residential`, `amenity/hospital`", example: "building/residential" }),
			location: zLocation,
		}),
	),
});

type LocationIqPlace = {
	lat: string;
	lon: string;
	class: string;
	type: string;
	display_place: string;
	address: { name?: string; house_number?: string; road?: string; neighbourhood?: string; suburb?: string; village?: string };
};

/** "Wrocławska 12" for an address; a named place keeps its name and gets the street as detail. */
export function toPlace(p: LocationIqPlace) {
	const { address: a } = p;
	const street = [a.road, a.house_number].filter(Boolean).join(" ");
	const isAddress = !a.name || a.name === a.road;
	return {
		name: isAddress ? street || p.display_place : a.name ?? p.display_place,
		detail: [isAddress ? undefined : street, a.suburb ?? a.village ?? a.neighbourhood].filter(Boolean).join(", "),
		kind: `${p.class}/${p.type}`,
		location: { x: Number(p.lon), y: Number(p.lat) },
	};
}

export const geocode = new Hono<AppEnv>().get(
	"/",
	describeRoute({
		operationId: "geocodeZg",
		description:
			"Streets, addresses and named places in Zielona Góra for search-as-you-type (LocationIQ autocomplete, © OpenStreetMap contributors).",
		responses: {
			200: jsonResponse(zGeocodeResponse, "Best matches first"),
			400: errorResponses[400],
			502: errorResponses[502],
		},
	}),
	// Same query → same answer for a day; also keeps us inside LocationIQ's free quota.
	edgeCache(CACHE.STATIC),
	query({
		q: z.string().trim().min(2).max(64).meta({ example: "wrocławska 12" }),
		limit: z.coerce.number().int().min(1).max(10).default(6),
	}),
	async (c) => {
		const { q, limit } = c.req.valid("query");
		const token = c.env.LOCATIONIQ_TOKEN;
		if (!token) throw new UpstreamError("Geocoding is not configured (LOCATIONIQ_TOKEN)");

		const url = new URL("https://api.locationiq.com/v1/autocomplete");
		url.search = new URLSearchParams({
			key: token,
			q,
			// A few extra, since some get filtered out below.
			limit: String(limit + 4),
			countrycodes: "pl",
			viewbox: VIEWBOX,
			bounded: "1",
			dedupe: "1",
			"accept-language": "pl",
		}).toString();

		let res: Response;
		try {
			res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
		} catch (cause) {
			throw new UpstreamError("LocationIQ did not answer", { cause, code: "UPSTREAM_TIMEOUT" });
		}
		// 404 = "Unable to geocode": no match, not an error.
		if (res.status === 404) return c.json({ places: [] });
		if (res.status === 429) throw new UpstreamError("LocationIQ rate limit", { code: "UPSTREAM_TIMEOUT" });
		if (!res.ok) throw new UpstreamError(`LocationIQ answered ${res.status}`);
		const seen = new Set<string>();
		const places = ((await res.json()) as LocationIqPlace[])
			.map(toPlace)
			.filter((p) => !SKIP.test(p.kind))
			// One "Wrocławska 12a" even when OSM has the building and things inside it.
			.filter((p) => {
				const key = `${p.name}|${p.detail}`.toLowerCase();
				return !seen.has(key) && seen.add(key);
			})
			.slice(0, limit);
		return c.json({ places });
	},
);
