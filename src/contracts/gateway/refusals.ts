import { reasonOf, refuse } from "../../lib/refusal/index.ts";

/**
 * The ways the gateway turns an agent away that the agent answers with advice
 * of its own, since what to do depends on the case and on files in a home that
 * the gateway knows nothing of. Each travels as the refusal's reason.
 */
export const TURNED_AWAY = {
  /** The name is another member's. */
  nameTaken: "name_taken",
  /** The roster does not have the token, as when the roster was replaced. */
  unknownToken: "unknown_token",
  /** A program is registered as the agent already, so this one is a second body for it: a copy of its home. */
  agentRunning: "agent_running",
} as const;

export type TurnedAway = (typeof TURNED_AWAY)[keyof typeof TURNED_AWAY];

/** Which of those a refusal from the gateway is, if it is one. This never reads the message. */
export function whyTurnedAway(error: unknown): TurnedAway | undefined {
  const reason = reasonOf(error);
  return Object.values(TURNED_AWAY).find((known) => known === reason);
}

/**
 * The reason of a refusal for a call that takes an admin when the caller is not
 * one. The gateway, the chat server and every agent refuse with it, so that
 * whoever asked can tell this case without reading the message.
 */
export const NEEDS_ADMIN = "needs_admin";

/** Names as a sentence: "zach", "zach or maya", "zach, maya or rex". */
function either(names: readonly string[]): string {
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} or ${names.at(-1) ?? ""}`;
}

/**
 * Refuse a call because it takes an admin and `caller` is not one. `what` is
 * what takes an admin, written to start a sentence, such as "Making a room".
 * The refusal says so, that the caller is not one, and who the admins are, in
 * two sentences, for a reader that has to find someone to ask.
 */
export function refuseNeedsAdmin(
  what: string,
  caller: { name: string },
  admins: readonly { name: string }[],
): never {
  return refuse(
    `${what} takes an admin, and ${caller.name} is not one. Ask an admin: ${either(admins.map((admin) => admin.name))}.`,
    "service_not_allowed",
    NEEDS_ADMIN,
  );
}
