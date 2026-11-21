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
