import { z } from "../../../lib/zod";

/**
 * MZK sometimes double-encodes entities (`&amp;#211;`), so after the XML
 * parser strings can still contain `&#211;` / `&quot;`. Decode what's left.
 */
export const decodeEntities = (str: string) =>
	str
		.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
		.replace(/&#x([0-9a-f]+);/gi, (_, code) =>
			String.fromCharCode(Number.parseInt(code, 16)),
		)
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&amp;/g, "&");

/** Upstream text field: entities decoded. */
export const zText = z.string().transform(decodeEntities);

/** Upstream text field: entities decoded and padding trimmed (line numbers are `"27   "`). */
export const zTrimmedText = z
	.string()
	.transform((s) => decodeEntities(s).trim());

/** XML attribute holding an integer. */
export const zIntAttr = z.coerce.number().int();

/** fast-xml-parser turns an empty element into "" — normalise to an object. */
export const asObject = (v: unknown) => (v && typeof v === "object" ? v : {});

export { z, zLocation } from "../../../lib/zod";
