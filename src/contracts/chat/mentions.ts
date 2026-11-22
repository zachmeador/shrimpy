import { nameKey } from "../gateway/index.ts";

/** What `@all` stands for. */
const EVERYONE = "all";

// A name is made of letters, digits and these; a dot is part of one only when another of them follows.
const BEFORE_A_MENTION = /[\p{L}\p{N}_]/u;
const INSIDE_A_NAME = /[\p{L}\p{N}_-]/u;

/**
 * Where `text` says `@name`, whatever the case, as where each starts and ends:
 * on its own, not inside an address like `maya@host` or a longer name like
 * `@mayamaya`. A full stop after it is the end of a sentence, not the start of
 * another name.
 */
export function mentionsOf(text: string, name: string): { start: number; end: number }[] {
  const key = nameKey(name);
  const found: { start: number; end: number }[] = [];
  for (let start = text.indexOf("@"); start !== -1; start = text.indexOf("@", start + 1)) {
    const end = start + 1 + name.length;
    if (nameKey(text.slice(start + 1, end)) !== key) continue;
    if (start > 0 && BEFORE_A_MENTION.test(text.charAt(start - 1))) continue;
    const next = text.charAt(end);
    if (INSIDE_A_NAME.test(next) || (next === "." && INSIDE_A_NAME.test(text.charAt(end + 1)))) continue;
    found.push({ start, end });
  }
  return found;
}

/** Whether `text` mentions the member called `name`: it says `@name`, whatever the case, or `@all`, which mentions every member. */
export const mentions = (text: string, name: string): boolean => mentionsOf(text, EVERYONE).length > 0 || mentionsOf(text, name).length > 0;
