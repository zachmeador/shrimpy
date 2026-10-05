/** What `@all` stands for. */
const EVERYONE = "all";

// A name is made of letters, digits and these; a dot is part of one only when another of them follows.
const BEFORE_A_MENTION = /[\p{L}\p{N}_]/u;
const INSIDE_A_NAME = /[\p{L}\p{N}_-]/u;

/**
 * Whether lower-cased `text` has `@name` in it, with `name` lower-cased too: on
 * its own, not inside an address like `maya@host` or a longer name like
 * `@mayamaya`. A full stop after it is the end of a sentence, not the start of
 * another name.
 */
function hasMention(text: string, name: string): boolean {
  const mention = `@${name}`;
  for (let at = text.indexOf(mention); at !== -1; at = text.indexOf(mention, at + 1)) {
    if (at > 0 && BEFORE_A_MENTION.test(text.charAt(at - 1))) continue;
    const end = at + mention.length;
    const next = text.charAt(end);
    if (INSIDE_A_NAME.test(next) || (next === "." && INSIDE_A_NAME.test(text.charAt(end + 1)))) continue;
    return true;
  }
  return false;
}

/**
 * Whether `text` mentions the member called `name`: it says `@name`, whatever
 * the case, or `@all`, which mentions every member. A name that is no member's
 * is for nobody. The chat server works out who a message in a room is for with
 * this, and an agent asks it of a message in a DM, where that is not worked
 * out because every message is for the other member.
 */
export function mentions(text: string, name: string): boolean {
  const lowered = text.toLowerCase();
  return hasMention(lowered, EVERYONE) || hasMention(lowered, name.toLowerCase());
}
