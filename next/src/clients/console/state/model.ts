import type { SessionView } from "../../../contracts/agent/index.ts";
import { agentMember, type Channel, type Member, type Thread, type ThreadView } from "../../../contracts/chat/index.ts";
import type { Registration } from "../../../contracts/gateway/index.ts";
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
  /** You, as the chat server knows you. */
  me: Member;
  where: Where;
  /** The gateway, which says what is running. */
  gateway: LinkStatus;
  /** What it last said, if it has: the programs running and the version of Shrimpy it runs. */
  listing: { programs: Registration[]; version: string } | undefined;
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
  name: string;
  /** The version of Shrimpy it runs. */
  version: string;
  working: boolean;
}

/** Whether `agent` is working in `thread`, going by the marks chat keeps. */
export function workingIn(thread: Thread, agent: string): boolean {
  const { id } = agentMember(agent);
  return thread.working.some((mark) => mark.memberId === id);
}

/** The agents running, by name, with whether each is working in a thread of the person's. */
export function agentEntries(model: Pick<Model, "listing" | "dms">): AgentEntry[] {
  const running = new Map<string, Registration>();
  for (const program of model.listing?.programs ?? []) {
    if (program.kind === "agent") running.set(program.name, program);
  }
  return [...running.values()]
    .map((program) => ({
      name: program.name,
      version: program.version,
      working: model.dms[program.name]?.threads.some((thread) => workingIn(thread, program.name)) ?? false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Work that goes on after the console is left: the agent that is working, and the thread it is working in. */
export interface Farewell {
  agent: string;
  thread: string;
}

export type SendResult = { ok: true } | { ok: false };
