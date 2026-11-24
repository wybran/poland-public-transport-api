/**
 * MZK Zielona Góra ticket prices.
 *
 * MZK has no machine-readable fares (their trip planner's price feature is
 * disabled: `lTPCB: false`, `tpSrc: ""` in rj.mzk.zgora.pl/js/Config.js), so this
 * is copied by hand from https://www.mzk.zgora.pl/cennik (strefa-a, strefa-b,
 * strefa-a-b, wszystkie-strefy). UPDATE `checkedAt` AND PRICES WHEN THE TARIFF CHANGES.
 *
 * Prices in grosze (1 PLN = 100 gr). `reduced: null` = no reduced price listed.
 */

export type Price = { normal: number | null; reduced: number | null };

export type Ticket = {
	id: string;
	zone: "A" | "B" | "A+B" | "ALL";
	medium: "paper" | "electronic" | "mobile";
	name: string;
	price: Price;
	/** Time the ticket is valid for after validation; null = not time-limited / not stated */
	validityMinutes: number | null;
	/** For 30-day / 90-day / semester tickets */
	validityDays: number | null;
	/** Number of rides included; null = unlimited or single ride */
	rides: number | null;
	notes: string | null;
};

/** Pay-per-ride from the electronic wallet: price by number of stops travelled. */
export type EWalletFare = {
	zone: "A" | "B" | "A+B";
	upTo2Stops: Price;
	from3To8Stops: Price;
	/** Each stop beyond 8 adds this, up to `max` */
	perExtraStop: Price;
	max: Price;
	/** One transfer allowed within this many minutes (exit of 1st bus → entry of 2nd) */
	transferMinutes: number;
};

export const FARES = {
	source: "https://www.mzk.zgora.pl/cennik",
	checkedAt: "2026-11-24",
	currency: "PLN" as const,
	priceUnit: "grosz" as const,
	zones: [
		{ id: "A", name: "Strefa A", description: "Zielona Góra (city)" },
		{ id: "B", name: "Strefa B", description: null },
		{ id: "A+B", name: "Strefa A+B", description: "Gmina Zabór" },
		{ id: "ALL", name: "Wszystkie strefy", description: null },
	] satisfies { id: Ticket["zone"]; name: string; description: string | null }[],
	notes: [
		"Night lines: all tickets are valid by the same rules as on day lines (same prices and reductions).",
		"Which zone suburban lines run in is not stated on the price pages — check with MZK.",
	],
	tickets: [
		// Strefa A
		{ id: "A-paper-single", zone: "A", medium: "paper", name: "Bilet jednorazowy (60 min)", price: { normal: 300, reduced: 150 }, validityMinutes: 60, validityDays: null, rides: null, notes: "Transfers allowed within 60 minutes of validation" },
		{ id: "A-paper-24h", zone: "A", medium: "paper", name: "Bilet dobowy 24-godzinny", price: { normal: 1200, reduced: 600 }, validityMinutes: 1440, validityDays: null, rides: null, notes: null },
		{ id: "A-30rides-30d", zone: "A", medium: "electronic", name: "Bilet 30 przejazdów / 30 dni", price: { normal: 6000, reduced: 3000 }, validityMinutes: null, validityDays: 30, rides: 30, notes: null },
		{ id: "A-90rides-30d", zone: "A", medium: "electronic", name: "Bilet 90 przejazdów / 30 dni", price: { normal: 7600, reduced: 3800 }, validityMinutes: null, validityDays: 30, rides: 90, notes: null },
		{ id: "A-mobile-30d", zone: "A", medium: "mobile", name: "Bilet mobilny 30-dniowy", price: { normal: 9000, reduced: 4500 }, validityMinutes: null, validityDays: 30, rides: null, notes: "Unlimited rides" },
		{ id: "A-90d", zone: "A", medium: "electronic", name: "Bilet 90-dniowy", price: { normal: 26000, reduced: 13000 }, validityMinutes: null, validityDays: 90, rides: null, notes: "Unlimited rides" },
		{ id: "A-bearer-30d", zone: "A", medium: "electronic", name: "Bilet 30-dniowy na okaziciela", price: { normal: 20000, reduced: null }, validityMinutes: null, validityDays: 30, rides: null, notes: "Unlimited rides, transferable" },
		{ id: "A-student-semester", zone: "A", medium: "electronic", name: "Bilet semestralny studencki", price: { normal: null, reduced: 17000 }, validityMinutes: null, validityDays: null, rides: null, notes: "One semester" },
		// Strefa B
		{ id: "B-paper-single", zone: "B", medium: "paper", name: "Bilet jednorazowy jednoprzejazdowy", price: { normal: 340, reduced: 170 }, validityMinutes: null, validityDays: null, rides: null, notes: null },
		{ id: "B-30rides-30d", zone: "B", medium: "electronic", name: "Bilet 30 przejazdów / 30 dni", price: { normal: 6400, reduced: 3200 }, validityMinutes: null, validityDays: 30, rides: 30, notes: null },
		{ id: "B-50rides-30d", zone: "B", medium: "electronic", name: "Bilet 50 przejazdów / 30 dni", price: { normal: 7600, reduced: 3800 }, validityMinutes: null, validityDays: 30, rides: 50, notes: null },
		{ id: "B-80rides-30d", zone: "B", medium: "electronic", name: "Bilet 80 przejazdów / 30 dni", price: { normal: 8400, reduced: 4200 }, validityMinutes: null, validityDays: 30, rides: 80, notes: null },
		{ id: "B-30d", zone: "B", medium: "electronic", name: "Bilet 30-dniowy", price: { normal: 11400, reduced: 5700 }, validityMinutes: null, validityDays: 30, rides: null, notes: "Unlimited rides" },
		// Strefa A+B
		{ id: "AB-paper-single", zone: "A+B", medium: "paper", name: "Bilet jednorazowy jednoprzejazdowy", price: { normal: 440, reduced: 220 }, validityMinutes: null, validityDays: null, rides: null, notes: null },
		{ id: "AB-30d-no-city", zone: "A+B", medium: "electronic", name: "Bilet 30-dniowy bez przesiadek na linie miejskie", price: { normal: 13000, reduced: 6500 }, validityMinutes: null, validityDays: 30, rides: null, notes: null },
		{ id: "AB-30d-45city", zone: "A+B", medium: "electronic", name: "Bilet 30-dniowy z przesiadką, 45 przejazdów liniami miejskimi", price: { normal: 14000, reduced: 7000 }, validityMinutes: null, validityDays: 30, rides: null, notes: "Includes 45 rides on city lines" },
		{ id: "AB-30d-90city", zone: "A+B", medium: "electronic", name: "Bilet 30-dniowy z przesiadką, 90 przejazdów liniami miejskimi", price: { normal: 16000, reduced: 8000 }, validityMinutes: null, validityDays: 30, rides: null, notes: "Includes 90 rides on city lines" },
		{ id: "AB-30d-unlimited-city", zone: "A+B", medium: "electronic", name: "Bilet 30-dniowy z przesiadką, bez limitu na liniach miejskich", price: { normal: 18000, reduced: 9000 }, validityMinutes: null, validityDays: 30, rides: null, notes: null },
		{ id: "AB-student-semester", zone: "A+B", medium: "electronic", name: "Bilet semestralny studencki", price: { normal: null, reduced: 32000 }, validityMinutes: null, validityDays: null, rides: null, notes: "One semester" },
		// Wszystkie strefy
		{ id: "ALL-paper-24h", zone: "ALL", medium: "paper", name: "Bilet dobowy 24-godzinny", price: { normal: 2000, reduced: 1000 }, validityMinutes: 1440, validityDays: null, rides: null, notes: null },
		{ id: "ALL-30d", zone: "ALL", medium: "electronic", name: "Bilet 30-dniowy na całą sieć", price: { normal: 36000, reduced: 18000 }, validityMinutes: null, validityDays: 30, rides: null, notes: "Unlimited rides" },
	] satisfies Ticket[],
	eWallet: [
		{ zone: "A", upTo2Stops: { normal: 100, reduced: 100 }, from3To8Stops: { normal: 260, reduced: 130 }, perExtraStop: { normal: 4, reduced: 2 }, max: { normal: 300, reduced: 150 }, transferMinutes: 20 },
		{ zone: "B", upTo2Stops: { normal: 130, reduced: 130 }, from3To8Stops: { normal: 320, reduced: 160 }, perExtraStop: { normal: 4, reduced: 2 }, max: { normal: 340, reduced: 170 }, transferMinutes: 20 },
		{ zone: "A+B", upTo2Stops: { normal: 200, reduced: 200 }, from3To8Stops: { normal: 400, reduced: 200 }, perExtraStop: { normal: 4, reduced: 2 }, max: { normal: 440, reduced: 220 }, transferMinutes: 20 },
	] satisfies EWalletFare[],
};
