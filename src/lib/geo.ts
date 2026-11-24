export type LatLon = { lat: number; lon: number };

/** Distance in meters (equirectangular — plenty accurate within a city). */
export const distanceMeters = (a: LatLon, b: LatLon) => {
	const x =
		(((b.lon - a.lon) * Math.PI) / 180) *
		Math.cos(((a.lat + b.lat) * Math.PI) / 360);
	const y = ((b.lat - a.lat) * Math.PI) / 180;
	return Math.round(Math.sqrt(x * x + y * y) * 6_371_000);
};

/** `"51.9358,15.4960"` → { lat, lon } (input already validated). */
export const parseLatLon = (value: string): LatLon => {
	const [lat = 0, lon = 0] = value.split(",").map(Number);
	return { lat, lon };
};

/** Lower-case, no Polish diacritics: "Łężyca" → "lezyca". */
export const normalizeName = (s: string) =>
	s
		.toLowerCase()
		.replace(/ł/g, "l")
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "");
