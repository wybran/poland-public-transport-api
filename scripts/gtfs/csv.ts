/**
 * Minimal RFC 4180 CSV parser for GTFS files: quoted fields, `""` escapes,
 * CRLF/LF line endings and a leading UTF-8 BOM.
 */
export const parseCsv = (text: string): Record<string, string>[] => {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;

	const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];
		if (inQuotes) {
			if (ch === '"') {
				if (input[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ",") {
			row.push(field);
			field = "";
		} else if (ch === "\n" || ch === "\r") {
			if (ch === "\r" && input[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += ch;
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const [header = [], ...data] = rows.filter(
		(r) => !(r.length === 1 && r[0] === ""),
	);
	return data.map((values) =>
		Object.fromEntries(header.map((name, i) => [name.trim(), values[i] ?? ""])),
	);
};
