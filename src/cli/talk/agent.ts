import type { Host, Reference } from "@earendil-works/chord";
import { Agent, Session } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import {
  type Client,
  contextOf,
  holding,
  type Member,
  needsAdmin,
  NO_GATEWAY,
  type Principal,
  type Revocation,
  type RosterEntry,
  unlessRefused,
} from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { GatewayNotRunningError, linkAs, viewOf } from "./gateway.ts";
import { me } from "./me.ts";

/** An agent a command reached: the host that holds its objects, and the agent address they are at. */
export interface AgentReached {
  /** The address its objects' `agent` param takes: its member ID through the gateway, or `HOME_AGENT` on its home socket. */
  readonly agent: string;
  readonly host: Host<Principal, Revocation>;
  /** Let go of the agent. Its work goes on. */
  close(): Promise<void>;
}

/** The agent as a whole, held through `reached` for as long as `work` runs. It is refused as the agent refuses it. */
export function onAgent<T>(reached: AgentReached, work: (agent: Reference<typeof Agent>) => Promise<T>, signal?: AbortSignal): Promise<T> {
  return holding(reached.host.get(Agent, { agent: reached.agent }, contextOf(signal)), (agent) => {
    unlessRefused(agent.refusal.value);
    return work(agent);
  });
}

/** One session of the agent, by its address, held through `reached` for as long as `work` runs. It is refused as the agent refuses it. */
export function onSession<T>(
  reached: AgentReached,
  session: string,
  work: (held: Reference<typeof Session>) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  return holding(reached.host.get(Session, { agent: reached.agent, session }, contextOf(signal)), (held) => {
    unlessRefused(held.refusal.value);
    return work(held);
  });
}

/**
 * Link to the gateway as the agent whose shell is at `shell`, which is who a
 * command run there is when it acts on the agent at `home`. Without a gateway
 * such an agent can't be reached at all, and the error says so.
 */
async function asTheAgentAt(shell: string, home: string): Promise<{ client: Client; members: RosterEntry[]; linked: string[]; you: Member }> {
  let client: Client;
  try {
    client = await linkAs(me());
  } catch (error) {
    if (!(error instanceof GatewayNotRunningError)) throw error;
    throw new Error(`The agent at ${home} can't be reached from an agent's shell without the gateway. ${NO_GATEWAY}`, { cause: error });
  }
  try {
    const view = await viewOf(client);
    if (view.you === null) throw new Error(`The gateway takes the agent at ${shell} for nobody.`);
    const linked = view.programs.flatMap((program) => (program.kind === "agent" && program.member !== null ? [program.member] : []));
    return { client, members: view.members, linked, you: view.you };
  } catch (error) {
    await client.close();
    throw error;
  }
}

/** Refuse unless `you` is an admin, as the roster says now, and name the admins to ask when it is not. `what` starts a sentence. */
function requireAdmin(you: Member, members: readonly RosterEntry[], what: string): void {
  if (you.admin) return;
  refuse(needsAdmin(what, you, members.filter((member) => member.admin)).words);
}

/**
 * Reach the agent that owns `home` by its name through the gateway, as the
 * agent whose shell is at `shell`, which is how one agent reaches another: the
 * agent reached decides what the one that asks may do. Gives undefined when no
 * agent is linked as it, once the roster has said that the one that asks may
 * ask, since no agent is there to refuse it.
 */
export async function reachAgent(shell: string, home: string): Promise<AgentReached | undefined> {
  const { client, members, linked, you } = await asTheAgentAt(shell, home);
  try {
    const memberId = readMembership(home)?.memberId;
    const target = members.find((member) => member.id === memberId);
    if (target === undefined || !linked.includes(target.id)) {
      requireAdmin(you, members, "Acting on another agent");
      await client.close();
      return undefined;
    }
    return { agent: target.id, host: client.host, close: () => client.close() };
  } catch (error) {
    await client.close();
    throw error;
  }
}

/**
 * Refuse unless the agent whose shell is at `shell` is an admin, as the gateway
 * says now. For what a command does to the files of the agent at `home`, which
 * no agent is there to guard. `what` is what takes an admin, written to start a
 * sentence.
 */
export async function requireAdminFor(shell: string, home: string, what: string): Promise<void> {
  const { client, members, you } = await asTheAgentAt(shell, home);
  try {
    requireAdmin(you, members, what);
  } finally {
    await client.close();
  }
}
