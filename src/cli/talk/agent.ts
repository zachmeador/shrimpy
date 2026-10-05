import { type AgentConnection, connectAgent } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import { type GatewayConnection, type Member, reachProgram, refuseNeedsAdmin } from "../../contracts/gateway/index.ts";
import { connectLocalGateway, GatewayNotRunningError, localTransports } from "../../contracts/gateway/node.ts";
import { START_EVERYTHING } from "./hints.ts";
import { signInAsAgentAt } from "./shell.ts";

/**
 * Run `use` on a connection to the gateway that is signed in as the agent whose
 * shell is at `shell`, which is who a command run there is when it acts on the
 * agent at `home`. Without a gateway such an agent can't be reached at all, and
 * the error says so.
 */
async function asTheAgentAt<T>(
  shell: string,
  home: string,
  use: (gateway: GatewayConnection, me: Member) => Promise<T>,
): Promise<T> {
  let gateway: GatewayConnection;
  try {
    gateway = await connectLocalGateway();
  } catch (error) {
    if (!(error instanceof GatewayNotRunningError)) throw error;
    throw new Error(
      `The agent at ${home} can't be reached from an agent's shell without the gateway, and no gateway is running ` +
        `on this machine. Start Shrimpy with: ${START_EVERYTHING}`,
      { cause: error },
    );
  }
  try {
    return await use(gateway, await signInAsAgentAt(gateway, shell));
  } finally {
    await gateway.close().catch(() => undefined);
  }
}

/** Refuse unless `me` is an admin, as the roster says now, and name the admins to ask when it is not. `what` starts a sentence. */
async function requireAdmin(gateway: GatewayConnection, me: Member, what: string): Promise<void> {
  if (me.admin) return;
  refuseNeedsAdmin(what, me, (await gateway.members()).filter((member) => member.admin));
}

/**
 * Connect to the agent that owns `home` by its name through the gateway, as the
 * agent whose shell is at `shell`, which is how one agent reaches another: the
 * agent reached decides what the one that asks may do. Gives undefined when no
 * agent is running there, once the roster has said that the one that asks may
 * ask, since no agent is there to refuse it. The caller closes the connection.
 */
export function reachAgent(shell: string, home: string): Promise<AgentConnection | undefined> {
  return asTheAgentAt(shell, home, async (gateway, me) => {
    const memberId = readMembership(home)?.memberId;
    const running = (await gateway.list()).findLast(
      (program) => program.kind === "agent" && memberId !== undefined && program.memberId === memberId,
    );
    if (running === undefined) {
      await requireAdmin(gateway, me, "Acting on another agent");
      return undefined;
    }
    const { connection } = await reachProgram({
      gateway,
      transports: localTransports(),
      target: { kind: running.kind, name: running.name },
      connect: connectAgent,
      enter: (opened, ticket) => opened.enter(ticket),
    });
    return connection;
  });
}

/**
 * Refuse unless the agent whose shell is at `shell` is an admin, as the gateway
 * says now. For what a command does to the files of the agent at `home`, which
 * no agent is there to guard. `what` is what takes an admin, written to start a
 * sentence.
 */
export function requireAdminFor(shell: string, home: string, what: string): Promise<void> {
  return asTheAgentAt(shell, home, (gateway, me) => requireAdmin(gateway, me, what));
}
