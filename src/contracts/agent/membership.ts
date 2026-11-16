import type { Entry } from "../gateway/index.ts";

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
   * The gateway's entry, for an agent apart from the gateway: the one it joined
   * through, where it reaches the gateway and chat from then on, and where a
   * command run in its shell does, with the fingerprint of the gateway's key,
   * which came with the invitation. A home with no entry uses the gateway on its
   * own machine.
   */
  gateway?: Entry;
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
