import { resolve } from "node:path";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import {
  type Address,
  entryTransports,
  type GatewayConnection,
  type Member,
  type Transports,
} from "../../contracts/gateway/index.ts";
import { localTransports } from "../../contracts/gateway/node.ts";
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
 * Act as the agent whose shell this command runs in, if it is one. The launcher
 * that puts `shrimpy` on an agent's path names the agent's home, and the
 * command signs in with the token that home keeps, so everything it does in
 * chat is the agent's. Anywhere else this does nothing, and the gateway takes
 * the connection for the person who runs it.
 */
export async function signInAsTheShellsAgent(gateway: GatewayConnection): Promise<void> {
  const home = process.env[AGENT_HOME_VARIABLE];
  if (home !== undefined && home !== "") await signInAsAgentAt(gateway, home);
}

/**
 * The address of the gateway's entry that the agent whose shell this command
 * runs in reaches, when the agent is apart from the gateway: the one its home
 * keeps. A command run anywhere else, and one in the shell of an agent beside
 * the gateway, has none, and reaches the gateway on this machine.
 */
export function shellsGateway(): Address | undefined {
  const home = process.env[AGENT_HOME_VARIABLE];
  return home === undefined || home === "" ? undefined : readMembership(home)?.gateway;
}

/** How this command reaches the gateway and the programs behind it: over the shell's agent's entry if it has one, and else on this machine. */
export function shellsTransports(): Transports {
  const gateway = shellsGateway();
  return gateway === undefined ? localTransports() : entryTransports(gateway);
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
