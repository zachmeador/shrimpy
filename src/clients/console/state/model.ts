import type { SessionView } from "../../../contracts/agent/index.ts";
import type { Channel, Member, Thread, ThreadView } from "../../../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../../../contracts/gateway/index.ts";
import type { LinkStatus, Problem } from "../network/index.ts";

/** Where in the console the person is. */
export type Where =
  | { screen: "agents" }
  | { screen: "threads"; agent: string }
  /** `thread` is undefined for a thread that is not started yet: it comes to be with its first message. */
  | { screen: "thread"; agent: string; thread: string | undefined };

/** The person's DM with an agent, and their threads in it, newest first. */
export interface Dm {
  channel: Channel;
  threads: Thread[];
}

/** Something that happened a moment ago that the person should know, which goes away by itself. */
export type Notice =
  | { kind: "not-sent"; problem: Problem }
  | { kind: "not-opened"; problem: Problem }
  | { kind: "not-watched"; problem: Problem }
  | { kind: "not-listed"; problem: Problem }
  | { kind: "stopped" }
  | { kind: "nothing-to-stop" }
  | { kind: "not-stopped"; problem: Problem };

export interface Model {
  /** You, as the chat server says the gateway knows you. Unknown until the console has been let in to chat. */
  me: Member | undefined;
  where: Where;
  /** The gateway, which says what is running and who is on the roster. */
  gateway: LinkStatus;
  /** What it last said, if it has: the programs running, the members, and the version of Shrimpy it runs. */
  listing: { programs: Registration[]; members: RosterEntry[]; version: string } | undefined;
  /** The chat server, where threads live. */
  chat: LinkStatus;
  /** The agent that is selected, once one is. */
  agent: LinkStatus | undefined;
  /** The person's DM with each agent that is running and that they have talked to, by the agent's name. */
  dms: Record<string, Dm>;
  /** The live view of the open thread. */
  thread: ThreadView | undefined;
  /** The live view of the session behind the open thread, once the agent has one. */
  session: SessionView | undefined;
  notice: Notice | undefined;
}

/** An agent as the list of agents shows it. */
export interface AgentEntry {
  /** The agent's ID in the roster, which chat knows it by. */
  id: string;
  name: string;
  /** Whether the agent is registered with the gateway now. An agent that is not is still on the roster. */
  running: boolean;
  /** The version of Shrimpy it runs, when it is running. */
  version: string | undefined;
  working: boolean;
}

/** Whether the member `agentId` is working in `thread`, going by the marks chat keeps. */
export function workingIn(thread: Thread, agentId: string): boolean {
  return thread.working.some((mark) => mark.memberId === agentId);
}

/**
 * The agents on the roster, by name, running or not, with whether each is
 * working in a thread of the person's.
 */
export function agentEntries(model: Pick<Model, "listing" | "dms">): AgentEntry[] {
  const running = new Map<string, Registration>();
  for (const program of model.listing?.programs ?? []) {
    if (program.kind === "agent" && program.memberId !== null) running.set(program.memberId, program);
  }
  return (model.listing?.members ?? [])
    .filter((member) => member.kind === "agent")
    .map((member) => ({
      id: member.id,
      name: member.name,
      running: running.has(member.id),
      version: running.get(member.id)?.version,
      working: model.dms[member.name]?.threads.some((thread) => workingIn(thread, member.id)) ?? false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Work that goes on after the console is left: the agent that is working, and the thread it is working in. */
export interface Farewell {
  agent: string;
  thread: string;
}

export type SendResult = { ok: true } | { ok: false };
