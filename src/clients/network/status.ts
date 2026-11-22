import type { RefState } from "@earendil-works/chord";
import { isLost } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";

/** Why a client has no link to a program, or to the gateway. */
export type Why =
  /** It has not tried yet, or is trying. */
  | { kind: "connecting" }
  /** Nothing is listening where the gateway should be. */
  | { kind: "not-running" }
  /** The gateway turned the client away, with its words. */
  | { kind: "refused"; words: string }
  /** The gateway's entry didn't prove it is yours, so the client sent it nothing, with the words of why. */
  | { kind: "unproven"; words: string }
  /** The gateway lists no such program as linked. */
  | { kind: "not-linked" }
  /** The program was reached, and the link to it ended. */
  | { kind: "lost" }
  /** The program is linked, and could not be reached or used for the reason given. */
  | { kind: "unreachable"; message: string };

/** Where a link to a program stands. */
export type LinkStatus = { state: "up" } | { state: "down"; why: Why };

export const UP: LinkStatus = { state: "up" };
export const CONNECTING: LinkStatus = { state: "down", why: { kind: "connecting" } };

/** A call that could not be made, for a reason a person can be given. */
export class Down extends Error {
  readonly why: Why;

  constructor(why: Why, options?: ErrorOptions) {
    super(`The link is down: ${why.kind}.`, options);
    this.name = "Down";
    this.why = why;
  }
}

/** What went wrong with a call, as data for the screen to put in words. */
export type Problem = { down: Why } | { said: string };

/** A call's failure as a problem: a refusal says its words, and a call lost with its link is the link's. */
export function problemOf(error: unknown): Problem {
  if (error instanceof Down) return { down: error.why };
  if (isLost(error)) return { down: { kind: "lost" } };
  return { said: asError(error).message };
}

/**
 * Where a link to a program stands, from the state of an object a client
 * holds there: up while it is live; not linked when the gateway lists no such
 * program, which `linked` says; lost when it was live before and is not now;
 * and otherwise still being reached, or failing with the words of why.
 */
export function statusOf(state: RefState, linked: boolean, wasUp: boolean): LinkStatus {
  if (state.kind === "live") return UP;
  if (!linked) return { state: "down", why: { kind: "not-linked" } };
  if (state.kind === "failed") return { state: "down", why: { kind: "unreachable", message: state.cause.error.message } };
  return { state: "down", why: wasUp ? { kind: "lost" } : { kind: "connecting" } };
}
