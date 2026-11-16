import type { AgentModels } from "../../../contracts/agent/index.ts";
import type { GatewayPlace } from "../../../contracts/gateway/node.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import { CONNECTING, keepGateway } from "../network/index.ts";
import { createAsking } from "./asking.ts";
import { readBack } from "./history.ts";
import { createHoldings } from "./holdings.ts";
import { agentEntries, type Farewell, farewellOf, type HomeLookup, type Model, type Notice, type SendResult } from "./model.ts";
import { createMoves } from "./moves.ts";
import { createSending } from "./sending.ts";
import { createStore } from "./store.ts";
import { worked } from "./worked.ts";

export interface ConsoleStateOptions {
  /** Where the gateway is: its own socket on this machine, or its entry, with the fingerprint of its key. */
  place: GatewayPlace;
  /** A device's token, to be you on a machine that joined, or null to be you on the gateway's own socket. */
  token: string | null;
  /** How long a notice stays. 6 seconds by default. */
  noticeMs?: number;
  /** How long sending a message waits for the chat server before saying it was not sent. 20 seconds by default. */
  sendMs?: number;
  /** The pauses between attempts to link to the gateway. Tests shorten them. */
  backoff?: Backoff;
  /** The moment it is, in milliseconds since the epoch, for saying when `/status` read what it shows. The clock by default. */
  now?: () => number;
  /** Whether this machine has a home for an agent that is not running, so that a note can say whether to start it here. */
  homes?: HomeLookup;
}

/** What the console knows and can do, without a terminal. */
export interface ConsoleState {
  model(): Model;
  /** Tell `listener` after each change. Returns what stops that. */
  subscribe(listener: (model: Model) => void): () => void;

  /** Show everything an agent takes part in. */
  selectAgent(name: string): void;
  /** Show the threads of a room the person is in, by its channel's ID. */
  selectRoom(roomId: string): void;
  /** Show the threads of a channel the person is not in and only reads, by its channel's ID. */
  selectReadOnly(channelId: string): void;
  /**
   * Open one of the threads on show, to talk and, from an agent's screen, to
   * watch that agent's work beside it. A thread of a channel the person is not
   * in is only read.
   */
  openThread(threadId: string): void;
  /** Start a thread with the selected agent or in the selected room. It comes to be with its first message. A channel the person only reads takes none. */
  startThread(): void;
  /**
   * In a thread opened from an agent's screen, turn it over to the session behind
   * it as that agent sees it, and back. The same thread is on show either way: both
   * go on being followed. It does nothing where the agent has no session behind
   * the thread.
   */
  turnOver(): void;
  /** Watch a session of the selected agent that is behind no thread, by its address. Nothing can be said or done in it. */
  openSession(address: string): void;
  /** Go up one level: from a thread or a session to the list it was opened from, and from that to the agents and rooms. */
  back(): void;

  /** Say something in the open thread, or in a new one. The person's draft is theirs to put back when it fails. */
  send(text: string): Promise<SendResult>;
  /** Tell the person something that came of what they wrote, in a note that goes away by itself. Posts nothing. */
  note(notice: Notice): void;
  /**
   * Read what `/status` shows for the open thread: the agent, what it is doing
   * there and what its session has used, why its last turn ended without an
   * answer and the wake-ups it waits on, or the agents of a room and who of them
   * is working. It is kept in the model as it stood when it was read, for the
   * person alone, until they send a message or leave the thread, and reading
   * again replaces it. Posts nothing.
   */
  readStatus(): Promise<void>;
  /** Read what `/devices` shows: the person's devices, each with its label and ID, kept in the model as `/status` is. Posts nothing. */
  readDevices(): void;
  /**
   * Take back the person's device that `written` names, by its label, whatever
   * the case, or by its ID: its link to the gateway ends at once. What came of it
   * is said in a notice, and a list of devices on show is read again. Posts nothing.
   */
  takeBack(written: string): Promise<void>;
  /**
   * The models the agent of the open DM thread can use now, and the one its
   * sessions follow by default, for the list that `/model ` opens. What the
   * agent said is kept for ten seconds, so that a list narrowed by typing does
   * not ask at every key. Undefined when there is no such agent, it is not
   * reached, or it does not answer in a few seconds.
   */
  models(): Promise<AgentModels | undefined>;
  /**
   * `/model` with nothing after it in the open DM thread: say in a notice which
   * model the thread's session uses and whether that is its own, or, for a thread
   * the agent has no session in yet, which model the agent's default is, since the
   * thread starts on it. Choosing another is a message, `/model` and a model, which
   * the agent acts on. Posts nothing.
   */
  showModel(): Promise<void>;

  /** The work that goes on if the console is left now, if there is any. */
  farewell(): Promise<Farewell | undefined>;
  /** Let go of every object held and of the link. The work in agents goes on. */
  close(): Promise<void>;
}

const NOTICE_MS = 6000;
const SEND_MS = 20_000;

/** The model before anything is known: on the first screen, linking to the gateway and chat. */
const startingModel = (homes: HomeLookup | undefined): Model => ({
  me: undefined,
  where: { screen: "agents" },
  gateway: CONNECTING,
  listing: undefined,
  chat: CONNECTING,
  agent: undefined,
  dms: {},
  rooms: {},
  readOnly: {},
  thread: undefined,
  session: undefined,
  sessions: undefined,
  workingSessions: {},
  refusal: undefined,
  notice: undefined,
  status: undefined,
  homes,
});

export async function createConsoleState(options: ConsoleStateOptions): Promise<ConsoleState> {
  const link = await keepGateway({ place: options.place, token: options.token, ...(options.backoff === undefined ? {} : { backoff: options.backoff }) });
  const held = createHoldings(link, () => store.changed());
  const store = createStore(startingModel(options.homes), {
    noticeMs: options.noticeMs ?? NOTICE_MS,
    worked(model) {
      held.followChannels();
      return worked(model, held, link);
    },
    follow: () => followModel(),
  });
  const stopLink = link.onChange(() => store.changed());
  const moves = createMoves(store, held);
  const sending = createSending(store, held, moves, options.sendMs ?? SEND_MS);
  const asking = createAsking(store, held, options.now ?? Date.now);
  let closed = false;

  /**
   * What follows from the model as it now stands: a thread that can't be had
   * says so, once; the person is taken to the only agent there is; while the
   * list of agents is on show, each agent that is running is held for what it
   * is working in, once the person has been taken to the only agent or has
   * found their own way, so that a console that opens on that agent does not
   * hold every agent first; and a session watched whole is read back.
   */
  function followModel(): void {
    const open = held.thread();
    const refusal = open?.held.shown()?.refusal;
    if (open !== undefined && refusal !== null && refusal !== undefined && open.told !== refusal.words) {
      open.told = refusal.words;
      store.say({ kind: "not-opened", problem: { said: refusal.words } });
    }
    const entries = agentEntries(store.model());
    moves.land(entries);
    const listed = store.model().where.screen === "agents" && moves.landed();
    held.callRoll(new Set(listed ? entries.filter((entry) => entry.running).map((entry) => entry.name) : []));
    readBack(held, store.model().where, () => store.changed());
  }

  return {
    model: () => store.model(),
    subscribe: (listener) => store.subscribe(listener),
    selectAgent: (name) => moves.selectAgent(name),
    selectRoom: (id) => moves.selectChannel({ kind: "room", id }),
    selectReadOnly: (id) => moves.selectChannel({ kind: "read-only", id }),
    openThread: (threadId) => moves.open(threadId),
    startThread: () => sending.startThread(),
    turnOver: () => moves.turnOver(),
    openSession: (address) => moves.openSession(address),
    back: () => moves.back(),
    send: (text) => sending.send(text),
    note: (notice) => store.say(notice),
    readStatus: () => asking.readStatus(),
    readDevices: () => asking.readDevices(),
    takeBack: (written) => asking.takeBack(written),
    models: () => asking.models(),
    showModel: () => asking.showModel(),
    farewell: async () => farewellOf(store.model()),
    async close() {
      if (closed) return;
      closed = true;
      store.close();
      stopLink();
      held.release();
      await link.close();
    },
  };
}
