import { lit, nul, obj, type Schema, str, union } from "@earendil-works/chord";
import { listed } from "../../lib/text/index.ts";

/**
 * The cases a reader acts on differently, so a refusal names them and nobody
 * reads its words to tell. All of them come when connecting, and the agent
 * and the CLI answer each with advice about the home's files. A refusal carries
 * any string as its reason, so a release of the major can add one without
 * changing a contract: these are the ones this release writes, and a reader
 * acts on those it knows and shows the words for any other.
 */
export type Reason =
  /** The name is another member's. */
  | "name_taken"
  /** The gateway doesn't know the token, as when the roster was replaced. */
  | "unknown_token"
  /** A program is linked as the agent already, so this one would be a second body for it: a copy of its home. */
  | "agent_running"
  /** The token was an agent's that was removed from the roster, which stops it. */
  | "removed";

/** A no on purpose: words for a person that say what to do, and a reason when the case has one, which may be one this release doesn't know. */
export type Refused = { kind: "refused"; words: string; reason: string | null };

/** What a method answers: what it did, or a refusal. Chord's own errors stay for real failures. */
export type Answer<T> = { kind: "done"; value: T } | Refused;

export function done<T>(value: T): Answer<T> {
  return { kind: "done", value };
}

export function refused(words: string, reason: Reason | null = null): Refused {
  return { kind: "refused", words, reason };
}

export const RefusedSchema = obj({ kind: lit("refused"), words: str(), reason: union([str(), nul()]) });

/** The schema of a method's answer whose value is `value`. */
export function answerOf<T>(value: Schema<T>) {
  return union([obj({ kind: lit("done"), value }), RefusedSchema]);
}

/**
 * The refusal of something that takes an admin, asked by `caller`, who isn't
 * one. `what` starts a sentence, such as "Making a room". It says who the
 * admins are, for a reader who has to find someone to ask.
 */
export function needsAdmin(what: string, caller: { name: string }, admins: readonly { name: string }[]): Refused {
  return refused(`${what} takes an admin, and ${caller.name} is not one. Ask an admin: ${listed(admins.map((admin) => admin.name), "or")}.`);
}
