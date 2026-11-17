/*
 * The rule for a name, as every program keeps one: a member's name, a device's
 * label, a room's and a thread's name. A name is one line of up to 200
 * characters, trimmed, and two names that differ only in case are one name.
 */

/** Characters in a name. */
export const MAX_NAME = 200;

/** What a name must be, to end a sentence that starts with what is named. */
export const NAME_RULE = `must be 1 to ${String(MAX_NAME)} characters on one line`;

/** `text` as a name is kept: trimmed, or undefined when that is empty, longer than `MAX_NAME` or has a control character in it. */
export function fitName(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.length > MAX_NAME || /\p{Cc}/u.test(trimmed) ? undefined : trimmed;
}

/** A name in the form names are compared in, so that two that differ only in case are found as one. */
export const nameKey = (name: string): string => name.toLowerCase();
