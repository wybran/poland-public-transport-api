/**
 * MZK's GTFS leaves route_color empty, so lines get colours from the Okabe–Ito palette
 * (distinguishable with colour blindness). textColor is the higher-contrast of black/white (≥ 5:1).
 * shortcut: 8 colours for ~50 lines, so lines share colours — replace with an MZK-approved
 * per-line table if MZK ever publishes one (then prefer route_color from GTFS).
 */
const PALETTE = [
	{ color: "#E69F00", textColor: "#000000" },
	{ color: "#56B4E9", textColor: "#000000" },
	{ color: "#009E73", textColor: "#000000" },
	{ color: "#F0E442", textColor: "#000000" },
	{ color: "#0072B2", textColor: "#FFFFFF" },
	{ color: "#D55E00", textColor: "#000000" },
	{ color: "#CC79A7", textColor: "#000000" },
	{ color: "#000000", textColor: "#FFFFFF" },
] as const;

/** Stable colour for a line number, so the same line looks the same in every app and every day. */
export const lineColors = (lineName: string) => {
	let hash = 0;
	for (const ch of lineName) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
	return PALETTE[hash % PALETTE.length] as (typeof PALETTE)[number];
};
