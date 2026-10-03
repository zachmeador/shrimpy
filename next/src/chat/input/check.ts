import type { Member } from "../../contracts/chat/index.ts";
import { MAX_ID, MAX_NAME, MAX_TEXT } from "./limits.ts";
import { refuse } from "./refusal.ts";

// Arguments arrive off the wire, so their TypeScript types promise nothing. Each
// check refuses with a message that names the argument as `what`.

/** An ID: one word, with no spaces or control characters. */
export function identifier(value: unknown, what: string): string {
  if (typeof value !== "string" || !/^[^\s\p{Cc}]+$/u.test(value) || value.length > MAX_ID) {
    refuse(`${what} must be an ID of 1 to ${MAX_ID} characters with no spaces.`);
  }
  return value;
}

/** A name for display: one line, and trimmed. */
export function label(value: unknown, what: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (name === "" || name.length > MAX_NAME || /\p{Cc}/u.test(name)) {
    refuse(`${what} must be 1 to ${MAX_NAME} characters on one line.`);
  }
  return name;
}

/** The text of a message, exactly as sent. */
export function messageText(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") refuse("A message needs some text.");
  if (value.length > MAX_TEXT) {
    refuse(`A message holds at most ${MAX_TEXT} characters, and this one has ${value.length}.`);
  }
  return value;
}

export function whole(value: unknown, what: string, least: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < least) {
    refuse(`${what} must be a whole number, ${least} or more.`);
  }
  return value;
}

export function flag(value: unknown, what: string): boolean {
  if (typeof value !== "boolean") refuse(`${what} must be true or false.`);
  return value;
}

export function member(value: unknown, what: string): Member {
  if (typeof value !== "object" || value === null) {
    refuse(`${what} must be a member: an id, a kind and a name.`);
  }
  const { id, kind, name } = value as Record<string, unknown>;
  if (kind !== "person" && kind !== "agent") refuse(`${what}.kind must be "person" or "agent".`);
  return { id: identifier(id, `${what}.id`), kind, name: label(name, `${what}.name`) };
}

/** A list of IDs, one to `most` long. */
export function identifiers(value: unknown, what: string, most: number): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > most) {
    refuse(`${what} must be a list of 1 to ${most} IDs.`);
  }
  return value.map((item) => identifier(item, `${what} item`));
}
