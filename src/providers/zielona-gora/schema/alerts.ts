import { decodeEntities, z } from "./common";

// /News/GetMessagesJson — the scrolling announcement bar on rj.mzk.zgora.pl.
// site.js only reads `message`; other fields (if any) are ignored.
// /News/GetMessageTitle?id= → ["I" | other, title]   (I = info, else warning)
// /News/GetMessageHtml?id=  → HTML fragment

/** HTML → plain text: tags removed, entities decoded, whitespace collapsed. */
export const htmlToText = (html: string) =>
	decodeEntities(
		html
			.replace(/<br\s*\/?>/gi, "\n")
			.replace(/<\/(p|div|li|h\d)>/gi, "\n")
			.replace(/<[^>]*>/g, ""),
	)
		.replace(/ /g, " ")
		.replace(/[ \t]+/g, " ")
		.replace(/\s*\n\s*/g, "\n")
		.trim();

export const zAlertsResponse = z.object({
	alerts: z.array(
		z.object({
			text: z.string(),
			html: z.string().meta({ description: "As published by MZK (may contain HTML)" }),
		}),
	),
});

export const zGetAlertsUpstream = z
	.array(z.looseObject({ message: z.string() }))
	.transform(
		(messages): z.infer<typeof zAlertsResponse> => ({
			alerts: messages
				.map((m) => ({ text: htmlToText(m.message), html: m.message }))
				.filter((m) => m.text !== ""),
		}),
	);

export const zAlertResponse = z.object({
	id: z.number(),
	type: z.enum(["info", "warning"]),
	title: z.string(),
	text: z.string(),
	html: z.string(),
});

export const zGetAlertTitleUpstream = z
	.tuple([z.string(), z.string()])
	.rest(z.unknown())
	.transform(([type, title]) => ({
		type: type === "I" ? ("info" as const) : ("warning" as const),
		title: htmlToText(title),
	}));
