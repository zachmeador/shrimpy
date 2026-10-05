import { reasonOf } from "../../lib/refusal/index.ts";

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
