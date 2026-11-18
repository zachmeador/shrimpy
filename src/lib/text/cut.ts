/** Whether cutting `text` at `index` would split a character that takes two UTF-16 code units. */
function splitsAt(text: string, index: number): boolean {
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

/** How `cutEnd` cuts a text. */
interface EndCut {
  /** What follows the start that is kept, when something was cut, such as "…". It counts toward the limit. */
  readonly ending?: string;
  /**
   * What the limit counts: UTF-16 code units, as `length` counts them and as a
   * program that checks the length of a text does, or characters, each counted
   * once however many code units it takes.
   */
  readonly unit?: "code units" | "characters";
}

/**
 * `text` as it is when it is no longer than `limit`, and otherwise as much of
 * its start as fits with `ending` after it. A character that takes two code
 * units is never split.
 */
export function cutEnd(text: string, limit: number, { ending = "", unit = "code units" }: EndCut = {}): string {
  if (unit === "characters") {
    const characters = Array.from(text);
    return characters.length <= limit ? text : `${characters.slice(0, limit - Array.from(ending).length).join("")}${ending}`;
  }
  if (text.length <= limit) return text;
  const end = limit - ending.length;
  return `${text.slice(0, splitsAt(text, end) ? end - 1 : end)}${ending}`;
}

/**
 * `text` as it is when it is no longer than `limit` UTF-16 code units, and
 * otherwise as much of its end as fits. A character that takes two code units
 * is never split.
 */
export function cutStart(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const start = text.length - limit;
  return text.slice(splitsAt(text, start) ? start + 1 : start);
}
