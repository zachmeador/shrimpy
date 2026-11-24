import type { Contract, Host, ParamsOf, Reference, RefState } from "@earendil-works/chord";
import { Agent, Session } from "../../contracts/agent/index.ts";
import { readMembership } from "../../contracts/agent/node.ts";
import {
  type Client,
  contextOf,
  holding,
  isOtherVersion,
  type Member,
  needsAdmin,
  NO_GATEWAY,
  type Principal,
  type Program,
  type Revocation,
  type RosterEntry,
  unlessRefused,
  waitingOnVersion,
} from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { allHomes } from "../folder/index.ts";
import { agentNamed } from "./agents.ts";
import { GatewayNotRunningError, linkAs, viewOf } from "./gateway.ts";
import { type Me, me } from "./me.ts";

/** An agent a command reached: the host that holds its objects, and the agent address they are at. */
export interface AgentReached {
  /** The address its objects' `agent` param takes: its member ID through the gateway, or `HOME_AGENT` on its home socket. */
  readonly agent: string;
  readonly host: Host<Principal, Revocation>;
  /** The agent as words name it, such as "the agent scout", and the Shrimpy it runs, when that is known. */
  readonly named: { what: string; version: string | undefined };
  /** Let go of the agent. Its work goes on. */
  close(): Promise<void>;
}

/** The agent as a whole, held through `reached` for as long as `work` runs. It is refused as the agent refuses it. */
export function onAgent<T>(reached: AgentReached, work: (agent: Reference<typeof Agent>) => Promise<T>, signal?: AbortSignal): Promise<T> {
  return holding(fitting(reached, Agent, { agent: reached.agent }, signal), (agent) => {
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
  return holding(fitting(reached, Session, { agent: reached.agent, session }, signal), (held) => {
    unlessRefused(held.refusal.value);
    return work(held);
  });
}

/**
 * The agent's object of `Type` at `params` once it is live, as `get` gives it,
 * or, as soon as the agent turns out to serve another version of it, an error
 * that names the agent and the Shrimpy it runs, where `get` would wait for one
 * of them to be updated.
 */
async function fitting<C extends Contract>(reached: AgentReached, Type: C, params: ParamsOf<C>, signal?: AbortSignal): Promise<Reference<C>> {
  const other = new AbortController();
  const watching = reached.host.hold(Type, params, contextOf(signal));
  const look = (state: RefState): void => {
    if (state.kind === "failed" && isOtherVersion(state.cause.error)) other.abort();
  };
  void watching.state.watch(contextOf(signal)).then(
    (watch) => {
      look(watch.value);
      watch.start(async (call) => {
        if (call.kind === "value") look(call.value);
      });
    },
    () => undefined,
  );
  try {
    return await reached.host.get(Type, params, contextOf(signal === undefined ? other.signal : AbortSignal.any([signal, other.signal])));
  } catch (error) {
    if (!other.signal.aborted) throw error;
    throw new Error(waitingOnVersion(reached.named.what, reached.named.version, "this command"), { cause: error });
  } finally {
    watching.release();
  }
}

/** An agent to reach through the gateway: the one the roster calls `name`, or the one whose home is at `home`, by the member ID the home keeps. */
export type Sought = { readonly name: string } | { readonly home: string };

/**
 * What can't be done without the gateway, to start the error when none runs
 * here. A name is only on the roster, and a person can reach a home on this
 * machine by its path instead. In an agent's shell another agent is reached
 * through the gateway either way.
 */
function withoutGateway(sought: Sought, who: Me): string {
  if ("home" in sought) return `The agent at ${sought.home} can't be reached from an agent's shell without the gateway.`;
  const byPath = who.home === undefined ? ", and a path to its home reaches it on this machine without one" : "";
  return `The agent ${oneLine(sought.name)} is found by its name through the gateway${byPath}.`;
}

/**
 * Link to the gateway as whoever the command is, which is who it is when it acts
 * on the agent `sought` names, and read the roster and which agents are linked.
 * Without a gateway the agent can't be reached, and the error says so.
 */
async function asMe(sought: Sought): Promise<{ client: Client; members: RosterEntry[]; linked: Program[]; you: Member }> {
  const who = me();
  let client: Client;
  try {
    client = await linkAs(who);
  } catch (error) {
    if (!(error instanceof GatewayNotRunningError)) throw error;
    throw new Error(`${withoutGateway(sought, who)} ${NO_GATEWAY}`, { cause: error });
  }
  try {
    const view = await viewOf(client);
    if (view.you === null) throw new Error(`The gateway takes ${who.home === undefined ? "this command" : `the agent at ${who.home}`} for nobody.`);
    const linked = view.programs.filter((program) => program.kind === "agent");
    return { client, members: view.members, linked, you: view.you };
  } catch (error) {
    await client.close();
    throw error;
  }
}

/** The member `sought` names on the roster: by its name, or by the ID its home keeps, which is undefined while the home has never joined. */
function memberSought(sought: Sought, members: readonly RosterEntry[]): RosterEntry | undefined {
  if ("name" in sought) return agentNamed(members, sought.name);
  const id = readMembership(sought.home)?.memberId;
  return members.find((member) => member.id === id);
}

/** Refuse unless `you` is an admin, as the roster says now, and name the admins to ask when it is not. `what` starts a sentence. */
function requireAdmin(you: Member, members: readonly RosterEntry[], what: string): void {
  if (you.admin) return;
  refuse(needsAdmin(what, you, members.filter((member) => member.admin)).words);
}

/**
 * Reach the agent `sought` names through the gateway, as whoever the command
 * is: the agent whose shell it runs in, the person whose machine joined, or you
 * on the gateway's own socket. The agent reached decides what the one that asks
 * may do, wherever it runs. Gives undefined when no agent is linked as it, once
 * the roster has said that the one that asks may ask about another agent, since
 * no agent is there to refuse it.
 */
export async function reachAgent(sought: Sought): Promise<AgentReached | undefined> {
  const { client, members, linked, you } = await asMe(sought);
  try {
    const target = memberSought(sought, members);
    const running = target === undefined ? undefined : linked.findLast((program) => program.member === target.id);
    if (target === undefined || running === undefined) {
      if (target?.id !== you.id) requireAdmin(you, members, "Acting on another agent");
      await client.close();
      return undefined;
    }
    const named = { what: `the agent ${target.name}`, version: running.shrimpy };
    return { agent: target.id, host: client.host, named, close: () => client.close() };
  } catch (error) {
    await client.close();
    throw error;
  }
}

/**
 * The home in the Shrimpy folder of the agent the roster calls `name`, found by
 * the member ID each home keeps, or undefined when the folder has none, as for
 * an agent that lives on another machine or under another account.
 */
export async function homeOnRoster(name: string): Promise<string | undefined> {
  const { client, members } = await asMe({ name });
  let id: string;
  try {
    // A name nobody on the roster has is an error that says so, and never matches a home that has not joined.
    id = agentNamed(members, name).id;
  } finally {
    await client.close();
  }
  return allHomes().find((home) => readMembership(home)?.memberId === id);
}

/**
 * Refuse unless the agent whose shell this command runs in is an admin, as the
 * gateway says now. For what a command does to the files of the agent at
 * `home`, which no agent is there to guard. `what` is what takes an admin,
 * written to start a sentence.
 */
export async function requireAdminFor(home: string, what: string): Promise<void> {
  const { client, members, you } = await asMe({ home });
  try {
    requireAdmin(you, members, what);
  } finally {
    await client.close();
  }
}
