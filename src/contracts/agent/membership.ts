/**
 * What an agent's home keeps so that the agent is the same member of the
 * network every time it starts, and so that a `shrimpy` command run from the
 * agent's shell can act as it.
 */
export interface Membership {
  /** The agent's ID in the gateway's roster. It never changes. */
  memberId: string;
  /** What the gateway gave the agent when it joined. Only the gateway is shown it. */
  token: string;
}

/** Where a home keeps its membership, inside the home. */
export const MEMBERSHIP_FILE = "state/member.json";

/**
 * The environment variable that names the home whose agent is running a
 * `shrimpy` command. The agent's launcher sets it, and a command that finds it
 * acts as that agent, signing in with the home's membership, instead of as the
 * person who runs the gateway.
 */
export const AGENT_HOME_VARIABLE = "SHRIMPY_AGENT_HOME";

/** The file in which the agent whose home is `home` keeps its membership. */
export function membershipFile(home: string): string {
  return `${home}/${MEMBERSHIP_FILE}`;
}
