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
