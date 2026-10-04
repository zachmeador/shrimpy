import { AgentConnectionLostError } from "../../../contracts/agent/index.ts";
import { isDisconnected } from "../../../lib/connection/index.ts";

/** Why the console has no connection to a program. */
export type Why =
  /** It has not tried yet, or is trying. */
  | { kind: "connecting" }
  /** Nothing is listening where the gateway should be. */
  | { kind: "not-running" }
  /** The gateway lists no such program. */
  | { kind: "not-registered" }
  /** The program was reached, and the connection ended. */
  | { kind: "lost" }
  /** The program is listed, and could not be reached or used for the reason given. */
  | { kind: "unreachable"; message: string };

/** Where a link to a program stands. */
export type LinkStatus = { state: "up" } | { state: "down"; why: Why };

export const CONNECTING: LinkStatus = { state: "down", why: { kind: "connecting" } };

/** A call that could not be made, or a connection that could not be opened, for a reason a person can be given. */
export class Down extends Error {
  readonly why: Why;

  constructor(why: Why, options?: ErrorOptions) {
    super(`The link is down: ${why.kind}.`, options);
    this.name = "Down";
    this.why = why;
  }
}

/** What went wrong with a call or a connection, as data for the screen to put in words. */
export type Problem = { down: Why } | { said: string };

export function problemOf(error: unknown): Problem {
  if (error instanceof Down) return { down: error.why };
  if (error instanceof AgentConnectionLostError || isDisconnected(error)) return { down: { kind: "lost" } };
  return { said: error instanceof Error ? error.message : String(error) };
}
