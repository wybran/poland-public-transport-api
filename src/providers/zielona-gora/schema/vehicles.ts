import { asObject, z, zLocation, zText } from "./common";

const zDirection = z.enum(["P", "T", "Z", ""]);

export const zVehicle = z.object({
	vehicleId: z.number(),
	lineNumber: z.string(),
	routeVariant: z.string(),
	direction: zDirection,
	courseId: z.number(),
	stopSequence: z.number(),
	plannedRoute: z.number(),
	actualRoute: z.number(),
	location: zLocation,
	previousLocation: zLocation,
	deviation: z.number().openapi({
		description: "Deviation from schedule in seconds (negative = delay)",
	}),
	deviationText: z.string().openapi({
		description: 'Deviation as text, e.g. "-00:01:42"',
	}),
	status: z.number().openapi({
		description:
			"Vehicle state (Stan). 1/2 = on route, 3/6/7/10 = at terminus waiting for departure",
	}),
	plannedStartTime: z.string(),
	nextCourseId: z.number(),
	nextPlannedStartTime: z.string(),
	nextLineNumber: z.string(),
	nextRouteVariant: z.string(),
	nextDirection: z.string(),
	secondsToDeparture: z.number(),
	vehicleType: z.string(),
	bearing: z.number().openapi({
		description: "Heading in degrees (0 = north, clockwise); -1 when unknown",
	}),
	isElectric: z.boolean(),
	finalStop: z.string(),
	initialStop: z.string(),
});

export const zVehiclesResponse = z.object({
	vehicleList: z.array(zVehicle),
});

// /Routes/CNR_GetVehicles — each <p> holds a JS array literal.
// Field order follows rj.mzk.zgora.pl/js/classes/VehicleManager.js
const zRawVehicle = z
	.tuple([
		z.number(), // 0  NrRadia
		z.number(), // 1  Nb
		z.string(), // 2  NumerLini
		z.string(), // 3  WarTrasy
		zDirection, // 4  Kierunek
		z.number(), // 5  IdKursu
		z.number(), // 6  LpPrzyst
		z.number(), // 7  DrogaPlan
		z.number(), // 8  DrogaWyko
		z.number(), // 9  Dlugosc
		z.number(), // 10 Szerokosc
		z.number(), // 11 PrevDlugosc
		z.number(), // 12 PrevSzerokosc
		z.number(), // 13 Odchylenie (seconds)
		z.string(), // 14 OdchylenieStr ("-00:01:42")
		z.number(), // 15 Stan
		z.string(), // 16 PlanGodzRozp
		z.number(), // 17 NastIdKursu
		z.string(), // 18 NastPlanGodzRozp
		z.string(), // 19 NastNumLini
		z.string(), // 20 NastWarTrasy
		z.string(), // 21 NastKierunek
		z.number(), // 22 IleSekDoOdjazdu
		z.string(), // 23 TypPojazdu
		z.string(), // 24 Cechy ("NE"/"N", unused by MZK site)
		zText, // 25 final stop
		zText, // 26 initial stop
		// 27 Wektor, 28 NapedElektryczny — optional, older responses omit them
	])
	.rest(z.number())
	.transform(
		(v): z.infer<typeof zVehicle> => ({
			vehicleId: v[0],
			lineNumber: v[2].trim(),
			routeVariant: v[3],
			direction: v[4],
			courseId: v[5],
			stopSequence: v[6],
			plannedRoute: v[7],
			actualRoute: v[8],
			location: { x: v[9], y: v[10] },
			previousLocation: { x: v[11], y: v[12] },
			deviation: v[13],
			deviationText: v[14],
			status: v[15],
			plannedStartTime: v[16],
			nextCourseId: v[17],
			nextPlannedStartTime: v[18],
			nextLineNumber: v[19].trim(),
			nextRouteVariant: v[20],
			nextDirection: v[21],
			secondsToDeparture: v[22],
			vehicleType: v[23],
			bearing: v[27] ?? -1,
			isElectric: v[28] === 1,
			finalStop: v[25],
			initialStop: v[26],
		}),
	);

export const zGetVehiclesUpstream = z
	.object({
		// An empty <VL/> parses to "" instead of an object
		VL: z.preprocess(
			asObject,
			z.object({
				p: z
					.array(
						z
							.string()
							.transform((str) => JSON.parse(str))
							.pipe(zRawVehicle),
					)
					.default([]),
			}),
		),
	})
	.transform(
		({ VL }): z.infer<typeof zVehiclesResponse> => ({ vehicleList: VL.p }),
	);
