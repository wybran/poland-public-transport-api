import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { CACHE, edgeCache } from "../../../lib/cache";
import type { AppEnv } from "../../../lib/env";
import { jsonResponse } from "../../../lib/openapi";
import { z } from "../../../lib/zod";
import { FARES } from "../fares";

const zPrice = z.object({
	normal: z.number().nullable().meta({ description: "Grosze (300 = 3,00 zł); null = not offered" }),
	reduced: z.number().nullable().meta({ description: "Grosze, reduced fare (ulgowy); null = not offered" }),
});

const zZoneId = z.enum(["A", "B", "A+B", "ALL"]);

const zFaresResponse = z.object({
	source: z.string(),
	checkedAt: z.string().meta({ description: "When prices were last copied from MZK's site" }),
	currency: z.literal("PLN"),
	priceUnit: z.literal("grosz"),
	zones: z.array(z.object({ id: zZoneId, name: z.string(), description: z.string().nullable() })),
	notes: z.array(z.string()),
	tickets: z.array(
		z.object({
			id: z.string(),
			zone: zZoneId,
			medium: z.enum(["paper", "electronic", "mobile"]),
			name: z.string(),
			price: zPrice,
			validityMinutes: z.number().nullable().meta({
				description: "Time limit after validation — compare with `ticketTimeSeconds` of a planner connection",
			}),
			validityDays: z.number().nullable(),
			rides: z.number().nullable(),
			notes: z.string().nullable(),
		}),
	),
	eWallet: z.array(
		z.object({
			zone: z.enum(["A", "B", "A+B"]),
			upTo2Stops: zPrice,
			from3To8Stops: zPrice,
			perExtraStop: zPrice,
			max: zPrice,
			transferMinutes: z.number(),
		}),
	),
});

export const fares = new Hono<AppEnv>().get(
	"/",
	describeRoute({
		operationId: "getZgFares",
		description:
			"Ticket prices (copied from mzk.zgora.pl/cennik — MZK publishes no machine-readable fares). Prices in grosze.",
		responses: { 200: jsonResponse(zFaresResponse, "Fares") },
	}),
	edgeCache(CACHE.STATIC),
	(c) => c.json(FARES satisfies z.infer<typeof zFaresResponse>),
);
