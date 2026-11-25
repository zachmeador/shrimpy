import { localTime } from "../../lib/time/index.ts";
import type { Entry } from "../gateway/index.ts";

/** A join that was tried and has not heard the gateway's answer yet, so retrying with the same link shows the same token. */
export interface JoiningMembership {
  token: string;
  gateway: Entry;
}

/**
 * What an agent's home keeps so that the agent is the same member of the
 * network every time it starts, and so that a `shrimpy` command run from the
 * agent's shell can act as it.
 */
export interface Membership {
  /**
   * What the agent is recognized by. The home makes it and keeps it before it
   * asks the gateway to let it join, so that an answer that never arrived
   * leaves the home able to join again as the same member. Only the gateway is
   * shown it.
   */
  token: string;
  /**
   * The agent's ID in the gateway's roster, as the gateway last said it, once it
   * has. It changes only when the gateway takes the token for a new member, as one
   * whose roster was replaced does beside it.
   */
  memberId?: string;
  /**
   * The ID of the roster this home last belonged to. An agent beside the
   * gateway sends it in its hello so a roster that forgot or took back its token
   * turns it away as unknown instead of letting it join again and colliding with
   * its own name.
   */
  rosterId?: string;
  /**
   * The gateway's entry, for an agent apart from the gateway: the one it joined
   * through, where it reaches the gateway and chat from then on, and where a
   * command run in its shell does, with the fingerprint of the gateway's key,
   * which came with the invitation. A home with no entry uses the gateway on its
   * own machine.
   */
  gateway?: Entry;
  /** A pending join whose answer has not arrived yet, kept apart so a failed join leaves an existing membership intact. */
  joining?: JoiningMembership;
  /**
   * That the gateway turned the agent away as removed from the roster, so the
   * agent doesn't start or link again until it is let in again, which writes
   * a membership without it.
   */
  removed?: Removal;
}

/** When the gateway turned the agent away as removed, in milliseconds since the epoch, and the gateway's words. */
export interface Removal {
  at: number;
  words: string;
}

/** Where a home keeps its membership, inside the home. */
const MEMBERSHIP_FILE = "state/member.json";

/**
 * The environment variable that names the home whose agent is running a
 * `shrimpy` command. The agent's launcher sets it, and a command that finds it
 * acts as that agent, linking with the home's token, instead of as you.
 */
export const AGENT_HOME_VARIABLE = "SHRIMPY_AGENT_HOME";

/** The file in which the agent whose home is `home` keeps its membership. */
export function membershipFile(home: string): string {
  return `${home}/${MEMBERSHIP_FILE}`;
}

/**
 * What to do when the gateway doesn't know the token that `file` keeps, as the
 * agent and a command in its shell both say it: apart from the gateway, get a
 * new invitation and run `shrimpy join <link>`; beside the gateway, delete
 * `file` so the agent makes a new token (or move its home out if it was
 * removed).
 */
export function unknownTokenAdvice(file: string, apart: boolean): string {
  return apart
    ? `Get a new invitation and run shrimpy join <link> here to give this agent a new token (replacing ${file}).`
    : `Delete ${file} so this agent makes a new token, or move its home out of the Shrimpy folder if it was removed.`;
}

/**
 * How the agent whose membership `file` keeps is let in again after it was
 * removed, as a new member: apart from the gateway, with a new invitation;
 * beside it, by deleting `file`, so it makes a new token and joins again.
 */
export function removedAdvice(file: string, apart: boolean): string {
  return apart
    ? `To let it in again, as a new member, get a new invitation and run shrimpy join <link> here.`
    : `To let it in again, as a new member, delete ${file} and start it again.`;
}

/** Why the agent `name`, whose membership `file` keeps `removal`, doesn't start, and how it is let in again. */
export function removedAtStart(name: string, file: string, removal: Removal, apart: boolean): string {
  return (
    `The gateway turned the agent ${name} away at ${localTime(removal.at)}: ${removal.words} ` +
    `So it doesn't start. ${removedAdvice(file, apart)}`
  );
}
