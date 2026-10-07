import { resolve } from "node:path";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import type { GatewayConnection, Member } from "../../contracts/gateway/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";

/**
 * Sign in as the agent whose home is `home`, with the token that home keeps,
 * and say who the connection is now, as the roster has them. An agent that has
 * not joined the network has nobody to act as.
 */
export async function signInAsAgentAt(gateway: GatewayConnection, home: string): Promise<Member> {
  const membership = readMembership(home);
  if (membership === undefined) {
    throw new Error(
      `This command runs in the shell of the agent at ${home}, which has not joined the network yet, ` +
        `so there is nobody for it to act as. Start the agent first: shrimpy agent serve ${home}`,
    );
  }
  try {
    return await gateway.signIn(membership.token, null);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    throw new Error(`The gateway did not let the agent at ${home} in: ${error.message}`, { cause: error });
  }
}

/**
 * The home of the agent whose shell this command runs in, when `home` is
 * another agent's. A command run anywhere else, and one about the shell's own
 * agent, has none: it is a person's, or the agent's own, and uses the home's
 * path.
 */
export function shellActingOn(home: string): string | undefined {
  const shell = process.env[AGENT_HOME_VARIABLE];
  if (shell === undefined || shell === "" || resolve(shell) === resolve(home)) return undefined;
  return shell;
}
