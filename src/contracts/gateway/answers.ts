import { lit, nul, obj, oneOf, type Schema, str, union } from "@earendil-works/chord";

/**
 * The cases a client acts on differently, so a refusal names them and nobody
 * reads its words to tell. All three come when connecting, and the agent and
 * the CLI answer each with advice about the home's files.
 */
export type Reason =
  /** The name is another member's. */
  | "name_taken"
  /** The gateway doesn't know the token, as when the roster was replaced. */
  | "unknown_token"
  /** A program is linked as the agent already, so this one would be a second body for it: a copy of its home. */
  | "agent_running";

/** A no on purpose: words for a person that say what to do, and the reason when the contract lists the case. */
export type Refused = { kind: "refused"; words: string; reason: Reason | null };

/** What a method answers: what it did, or a refusal. Chord's own errors stay for real failures. */
export type Answer<T> = { kind: "done"; value: T } | Refused;

export function done<T>(value: T): Answer<T> {
  return { kind: "done", value };
}

export function refused(words: string, reason: Reason | null = null): Refused {
  return { kind: "refused", words, reason };
}

export const ReasonSchema = oneOf("name_taken", "unknown_token", "agent_running");

export const RefusedSchema = obj({ kind: lit("refused"), words: str(), reason: union([ReasonSchema, nul()]) });

/** The schema of a method's answer whose value is `value`. */
export function answerOf<T>(value: Schema<T>) {
  return union([obj({ kind: lit("done"), value }), RefusedSchema]);
}

/** Names as a sentence: "zach", "zach or maya", "zach, maya or rex". */
function either(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}`;
}

/**
 * The refusal of something that takes an admin, asked by `caller`, who isn't
 * one. `what` starts a sentence, such as "Making a room". It says who the
 * admins are, for a reader who has to find someone to ask.
 */
export function needsAdmin(what: string, caller: { name: string }, admins: readonly { name: string }[]): Refused {
  return refused(`${what} takes an admin, and ${caller.name} is not one. Ask an admin: ${either(admins.map((admin) => admin.name))}.`);
}
