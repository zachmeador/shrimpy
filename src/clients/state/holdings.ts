import type { SessionItem } from "../../contracts/agent/index.ts";
import {
  type AgentCalls,
  type AgentShown,
  type ChannelCalls,
  type ChannelShown,
  type ChatCalls,
  type ChatShown,
  type GatewayLink,
  holdAgent,
  holdChannel,
  holdChat,
  type Holding,
  holdRoster,
  holdSession,
  holdThread,
  type RosterCalls,
  type RosterShown,
  type SessionCalls,
  type SessionShown,
  type ThreadCalls,
  type ThreadShown,
} from "../network/index.ts";

/** The open thread, held, and the refusal it was last said to have, so that it is said once. */
export interface OpenThread {
  readonly id: string;
  readonly held: Holding<ThreadShown, ThreadCalls>;
  told: string | undefined;
}

/** The session on show, held, and what was read of it before its window. */
export interface SessionOnShow {
  readonly agent: string;
  readonly address: string;
  readonly held: Holding<SessionShown, SessionCalls>;
  /** The items read back from `from`, the entry the window started after, and the entry before the oldest of them. */
  older: { from: number; items: SessionItem[]; before: number | null } | undefined;
  /** The entry a reading back is under way from. */
  reading: number | undefined;
}

/** An agent held through the link, by its member ID. */
export interface HeldAgent {
  readonly id: string;
  readonly held: Holding<AgentShown, AgentCalls>;
}

/** Everything a client holds through its link, each followed until it is let go of. */
export interface Holdings {
  readonly roster: Holding<RosterShown, RosterCalls>;
  readonly chat: Holding<ChatShown, ChatCalls>;
  /** The channel `id`, held for its threads while chat lists it to the person. */
  channel(id: string): Holding<ChannelShown, ChannelCalls> | undefined;
  /** The agent whose screen, or whose thread or session, is on show. */
  agent(): HeldAgent | undefined;
  /** Each running agent, by its member ID, held for what it is working in while the list of agents is on show. */
  rollCall(): ReadonlyMap<string, Holding<AgentShown, AgentCalls>>;
  thread(): OpenThread | undefined;
  session(): SessionOnShow | undefined;
  /** Hold the channels chat lists to the person, and let go of those it no longer lists. */
  followChannels(): void;
  /** Hold each agent in `ids` for what it is working in, and let go of every other. */
  callRoll(ids: ReadonlySet<string>): void;
  /** Hold the agent with member ID `id`, and let go of any other, or of every one with none. */
  useAgent(id: string | undefined): void;
  /** Hold the thread `id`, and let go of any other, or of every one with none. */
  useThread(id: string | undefined): void;
  /** Hold the session at `address` of the agent with member ID `agent`, and let go of any other, or of every one with none. */
  useSession(agent: string | undefined, address: string | undefined): void;
  /** Run `work` on the channel `id`: as it is held, or held for as long as `work` runs. */
  onChannel<T>(id: string, work: (channel: Holding<ChannelShown, ChannelCalls>) => Promise<T>): Promise<T>;
  /** Run `work` on the thread `id`: the open thread's hold when it is that one, or a hold for as long as `work` runs. */
  onThread<T>(id: string, work: (thread: Holding<ThreadShown, ThreadCalls>) => Promise<T>): Promise<T>;
  /** Let go of everything held. */
  release(): void;
}

/** Make what `held` holds the keys `wanted` has: hold each that is new with `hold`, and let go of the rest. */
function keepOnly<V, C>(held: Map<string, Holding<V, C>>, wanted: ReadonlySet<string>, hold: (key: string) => Holding<V, C>): void {
  for (const [key, each] of held) {
    if (wanted.has(key)) continue;
    each.release();
    held.delete(key);
  }
  for (const key of wanted) if (!held.has(key)) held.set(key, hold(key));
}

/** Run `work` on an object held for as long as it runs. */
async function borrowing<V, C, T>(held: Holding<V, C>, work: (held: Holding<V, C>) => Promise<T>): Promise<T> {
  try {
    return await work(held);
  } finally {
    held.release();
  }
}

/** Hold the roster and chat through `link`, and the rest as the client asks. `changed` is told of each change of what is held. */
export function createHoldings(link: GatewayLink, changed: () => void): Holdings {
  const roster = holdRoster(link, changed);
  const chat = holdChat(link, changed);
  const channels = new Map<string, Holding<ChannelShown, ChannelCalls>>();
  const rollCall = new Map<string, Holding<AgentShown, AgentCalls>>();
  let selected: HeldAgent | undefined;
  let thread: OpenThread | undefined;
  let session: SessionOnShow | undefined;
  return {
    roster,
    chat,
    channel: (id) => channels.get(id),
    agent: () => selected,
    rollCall: () => rollCall,
    thread: () => thread,
    session: () => session,
    followChannels() {
      const shown = chat.shown();
      if (shown === undefined) return;
      const wanted = new Set([...shown.channels, ...shown.readOnlyChannels].map((channel) => channel.id));
      keepOnly(channels, wanted, (id) => holdChannel(link, id, changed));
    },
    callRoll: (ids) => keepOnly(rollCall, ids, (id) => holdAgent(link, id, changed)),
    useAgent(id) {
      if (selected?.id === id) return;
      selected?.held.release();
      selected = id === undefined ? undefined : { id, held: holdAgent(link, id, changed) };
    },
    useThread(id) {
      if (thread?.id === id) return;
      thread?.held.release();
      thread = id === undefined ? undefined : { id, held: holdThread(link, id, changed), told: undefined };
    },
    useSession(agent, address) {
      if (session?.agent === agent && session?.address === address) return;
      session?.held.release();
      session =
        agent === undefined || address === undefined
          ? undefined
          : { agent, address, held: holdSession(link, agent, address, changed), older: undefined, reading: undefined };
    },
    onChannel(id, work) {
      const held = channels.get(id);
      return held === undefined ? borrowing(holdChannel(link, id, () => undefined), work) : work(held);
    },
    onThread(id, work) {
      return thread?.id === id ? work(thread.held) : borrowing(holdThread(link, id, () => undefined), work);
    },
    release() {
      for (const held of rollCall.values()) held.release();
      for (const held of channels.values()) held.release();
      selected?.held.release();
      thread?.held.release();
      session?.held.release();
      chat.release();
      roster.release();
    },
  };
}
