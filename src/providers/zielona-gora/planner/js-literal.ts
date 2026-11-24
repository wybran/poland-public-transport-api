/**
 * Converts a JavaScript array/object literal (as returned by MZK's trip
 * planner, meant for `eval`) into JSON, without evaluating anything:
 *
 *   {id:'t_0',data:[[0,"",1.5,,{lat:51.9, lng:15.4}]]}
 *   → {"id":"t_0","data":[[0,"",1.5,null,{"lat":51.9,"lng":15.4}]]}
 *
 * Handles unquoted keys, single-quoted strings and empty array slots.
 */
export const jsLiteralToJson = (src: string): string => {
	let out = "";
	const stack: ("[" | "{")[] = [];
	/** Last non-whitespace character emitted outside strings */
	let prev = "";

	for (let i = 0; i < src.length; i++) {
		const ch = src[i] as string;

		// Strings: copy double-quoted as is, convert single-quoted to JSON
		if (ch === '"' || ch === "'") {
			let value = "";
			let j = i + 1;
			for (; j < src.length && src[j] !== ch; j++) {
				if (src[j] === "\\") {
					const next = src[j + 1] ?? "";
					// \' is valid JS but not JSON; keep every other escape
					value += next === "'" ? "'" : `\\${next}`;
					j++;
				} else if (src[j] === '"' && ch === "'") {
					value += '\\"';
				} else {
					value += src[j];
				}
			}
			out += `"${value}"`;
			i = j;
			prev = '"';
			continue;
		}

		if (/\s/.test(ch)) {
			out += ch;
			continue;
		}

		// Empty array slot: `[,` `,,` `,]` inside an array → null
		if ((ch === "," || ch === "]") && stack.at(-1) === "[" && (prev === "," || (prev === "[" && ch === ","))) {
			out += "null";
		}

		// Unquoted object key: identifier after `{` or `,` followed by `:`
		if (/[A-Za-z_$]/.test(ch) && stack.at(-1) === "{" && (prev === "{" || prev === ",")) {
			const match = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
			const key = match?.[0] ?? ch;
			const rest = src.slice(i + key.length);
			if (/^\s*:/.test(rest)) {
				out += `"${key}"`;
				i += key.length - 1;
				prev = '"';
				continue;
			}
		}

		if (ch === "[" || ch === "{") stack.push(ch);
		if (ch === "]" || ch === "}") stack.pop();

		out += ch;
		prev = ch;
	}
	return out;
};
