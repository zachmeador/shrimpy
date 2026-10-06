const ESC = "\\u001b";

/**
 * Control sequences, matched whole so that nothing of one is left to read as
 * text: strings that end at BEL or ST (OSC, DCS, SOS, PM, APC), CSI sequences
 * in their 7-bit and 8-bit forms, and the short escapes such as ESC c. The
 * strings come first, since the short escape would otherwise take only their
 * first two characters.
 */
const SEQUENCES = new RegExp(
  [
    `(?:${ESC}[\\]PX^_]|[\\u0090\\u0098\\u009d\\u009e\\u009f])[^\\u0007${ESC}\\u009c]*(?:\\u0007|${ESC}\\\\|\\u009c)`,
    `(?:${ESC}\\[|\\u009b)[\\u0030-\\u003f]*[\\u0020-\\u002f]*[\\u0040-\\u007e]`,
    `${ESC}[\\u0020-\\u002f]*[\\u0030-\\u007e]`,
  ].join("|"),
  "g",
);

/** The Unicode line and paragraph separators, which a terminal shows as nothing or as a mark. */
const SEPARATORS = new RegExp("[\\u2028\\u2029]", "g");

/**
 * What is left once the sequences are gone: every control character but the
 * line break, and the characters that reorder the text around them. A tab, a
 * carriage return and the Unicode line separators are turned into spaces and
 * line breaks before this.
 */
const CONTROLS = new RegExp("[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]", "g");

/**
 * Text from another member, or from a tool, made harmless for a terminal: it
 * can't move the cursor, change colors that outlive it, set the title, reach
 * the clipboard or ask the terminal anything. Line breaks stay, and so does
 * every character that is meant to be seen.
 */
export function plain(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(SEQUENCES, "")
    .replace(SEPARATORS, "\n")
    .replace(/\t/g, "   ")
    .replace(CONTROLS, "");
}

/** `plain`, on one line: line breaks become spaces, and the ends are trimmed. */
export function oneLine(text: string): string {
  return plain(text).replace(/\s*\n\s*/g, " ").trim();
}

/** `index`, moved back off the middle of a character that takes two code units. */
function whole(text: string, index: number): number {
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff ? index - 1 : index;
}

/** The first `characters` characters of `text`, and how many were left out after them. */
export function firstCharacters(text: string, characters: number): { text: string; cut: number } {
  if (text.length <= characters) return { text, cut: 0 };
  const end = whole(text, characters);
  return { text: text.slice(0, end), cut: text.length - end };
}

/** The last `characters` characters of `text`, and how many were left out before them. */
export function lastCharacters(text: string, characters: number): { text: string; cut: number } {
  if (text.length <= characters) return { text, cut: 0 };
  const start = whole(text, text.length - characters);
  return { text: text.slice(start), cut: start };
}

/** How many lines `text` has: one more than its line breaks. */
export function countLines(text: string): number {
  let lines = 1;
  for (let at = text.indexOf("\n"); at !== -1; at = text.indexOf("\n", at + 1)) lines += 1;
  return lines;
}

/**
 * The last `lines` lines of `text`, and no more than its last `characters`
 * characters, for what streams and grows and may have one line of megabytes.
 */
export function lastLines(text: string, lines: number, characters = Number.POSITIVE_INFINITY): string {
  const kept = text.length > characters ? text.slice(text.length - characters) : text;
  let from = kept.endsWith("\n") ? kept.length - 1 : kept.length;
  for (let seen = 0; seen < lines; seen++) {
    if (from <= 0) return kept;
    const before = kept.lastIndexOf("\n", from - 1);
    if (before === -1) return kept;
    from = before;
  }
  return kept.slice(from + 1);
}
