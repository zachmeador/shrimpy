import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import type { GatewayConnection } from "../../contracts/gateway/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";

/**
 * Act as the agent whose shell this command runs in, if it is one. The launcher
 * that puts `shrimpy` on an agent's path names the agent's home, and the
 * command signs in with the token that home keeps, so everything it does in
 * chat is the agent's. Anywhere else this does nothing, and the gateway takes
 * the connection for the person who runs it.
 */
export async function signInAsTheShellsAgent(gateway: GatewayConnection): Promise<void> {
  const home = process.env[AGENT_HOME_VARIABLE];
  if (home === undefined || home === "") return;
  const membership = readMembership(home);
  if (membership === undefined) {
    throw new Error(
      `This command runs in the shell of the agent at ${home}, which has not joined the network yet, ` +
        `so there is nobody for it to act as. Start the agent first: shrimpy agent serve ${home}`,
    );
  }
  try {
    await gateway.signIn(membership.token, null);
  } catch (error) {
    if (!isRefusal(error)) throw error;
    throw new Error(`The gateway did not let the agent at ${home} in: ${error.message}`, { cause: error });
  }
}
