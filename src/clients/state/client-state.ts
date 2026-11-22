import type { AgentModels, HomeEntry, HomeFile, TriggerDetail } from "../../contracts/agent/index.ts";
import type { Message } from "../../contracts/chat/index.ts";
import { type Answer, valueOf } from "../../contracts/gateway/index.ts";
import type { Backoff } from "../../lib/retry/index.ts";
import { type AgentCalls, CONNECTING, type Dial, Down, keepGateway, problemOf } from "../network/index.ts";
import { createAsking } from "./asking.ts";
import { readBack } from "./history.ts";
import { createHoldings } from "./holdings.ts";
import {
  agentEntries,
  agentOfList,
  type Farewell,
  farewellOf,
  type AgentRead,
  type HomeLookup,
  type Model,
  type Notice,
  type Place,
  sessionsOpen,
} from "./model.ts";
import { createMoves } from "./moves.ts";
import { createSending } from "./sending.ts";
import { createStore } from "./store.ts";
import { worked } from "./worked.ts";
import { writtenIn } from "./written.ts";

export interface ClientStateOptions {
  /** How to dial the gateway, which the client hands it: from Node, at its own socket on this machine or at its entry. */
  dial: Dial;
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

/** What a client knows and can do, without a terminal or a page. */
export interface ClientState {
  model(): Model;
  /** Tell `listener` after each change. Returns what stops that. */
  subscribe(listener: (model: Model) => void): () => void;

  /**
   * Open the list of everything an agent takes part in, by its member ID.
   * Opening another list closes what was open in the one before, and the list
   * that is open stays as it is, with what is open in it.
   */
  selectAgent(id: string): void;
  /** Open the list of a room the person is in, by its channel's ID, as `selectAgent` opens an agent's. */
  selectRoom(roomId: string): void;
  /** Open the list of a channel the person is not in and only reads, by its channel's ID, as `selectAgent` opens an agent's. */
  selectReadOnly(channelId: string): void;
  /**
   * Open one of the threads of the open list, to talk and, from an agent's
   * list, to watch that agent's work beside it, or open it afresh: the
   * conversation is on show again, and what `/status` read goes. A thread of a
   * channel the person is not in is only read.
   */
  openThread(threadId: string): void;
  /**
   * Start a thread in `place`, the person's DM with an agent or a room they are
   * in, or with the agent or in the room whose list is open when none is given.
   * It comes to be with its first message. A channel the person only reads
   * takes none.
   */
  startThread(place?: Place): void;
  /**
   * In a thread, put the next agent's view of the session behind it on show in
   * place of the conversation, in the order `sidesOf` gives, and after the last
   * the conversation again. The same thread is open either way: all of it goes
   * on being followed. It does nothing where no agent has a session behind the
   * thread.
   */
  turnOver(): void;
  /**
   * In a thread, put the view of the agent with member ID `agent` of the
   * session behind it on show in place of the conversation. It does nothing
   * where that agent has no session behind the thread.
   */
  showView(agent: string): void;
  /** Open a session of the agent whose list is open that is behind no thread, by its address. Nothing can be said or done in it. */
  openSession(address: string): void;
  /**
   * Say whether the person is looking at the open thread, as the client can
   * tell. While they are, its read mark is moved up to its newest message
   * whenever anything in it is new to them. They are not until a client says so.
   */
  look(looking: boolean): void;
  /**
   * Join the room the open thread is in, which the person only reads, by adding
   * them to it. The thread takes their input once chat says they are in it. A
   * room that can't be joined says why in a notice.
   */
  joinRoom(): Promise<void>;

  /**
   * Act on what the person wrote in the open thread: post it, as a message or
   * a command for agents, do what a command for the client says, or tell them
   * why it was refused, as a text that starts with a slash may be. Says whether
   * the text was taken. One that was not is the person's to put back where it
   * was typed.
   */
  write(text: string): Promise<boolean>;
  /** Say something in the open thread, or in a new one, and say whether it was sent. The person's draft is theirs to put back when it was not. */
  send(text: string): Promise<boolean>;
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
  /**
   * The entries of a folder of the home of the agent whose list is open, by
   * the folder's path there, "" for the home itself, or why they could not be
   * read. Nothing in the home is changed.
   */
  folder(path: string): Promise<AgentRead<HomeEntry[]>>;
  /** A file of the home of the agent whose list is open, by its path there, as text or an image, or why it could not be read. */
  file(path: string): Promise<AgentRead<HomeFile>>;
  /** One trigger of the agent whose list is open, by name, with what defines it, or why it could not be read. */
  trigger(name: string): Promise<AgentRead<TriggerDetail>>;

  /** The work that goes on if the client is left now, if there is any. */
  farewell(): Farewell | undefined;
  /** Let go of every object held and of the link. The work in agents goes on. */
  close(): Promise<void>;
}

const NOTICE_MS = 6000;
const SEND_MS = 20_000;
/** How long the agent whose list is open is waited for to show a folder or a file of its home, or a trigger. */
const ASKING_MS = 10_000;

/** The model before anything is known: nothing open, linking to the gateway and chat. */
const startingModel = (homes: HomeLookup | undefined): Model => ({
  me: undefined,
  open: { list: undefined, item: undefined },
  gateway: CONNECTING,
  listing: undefined,
  chat: CONNECTING,
  agent: undefined,
  dms: {},
  rooms: {},
  readOnly: {},
  thread: undefined,
  behind: {},
  watched: undefined,
  sessions: undefined,
  triggers: undefined,
  defaultModel: undefined,
  looks: {},
  workingSessions: {},
  refusal: undefined,
  watchRefusal: undefined,
  notice: undefined,
  status: undefined,
  homes,
});

/**
 * The ID of the first of `messages` that is new to the person, the member
 * `me`, when `unread` are: chat counts what others wrote after the read mark,
 * leaving out deleted messages, so it is the `unread`th of those from the end,
 * or the earliest of them on show when fewer are.
 */
function firstNewOf(messages: readonly Message[], unread: number, me: string | undefined): string | undefined {
  let first: string | undefined;
  let counted = 0;
  for (let at = messages.length - 1; at >= 0 && counted < unread; at--) {
    const message = messages[at];
    if (message === undefined || message.deleted || message.author.id === me) continue;
    first = message.id;
    counted += 1;
  }
  return first;
}

export async function createClientState(options: ClientStateOptions): Promise<ClientState> {
  const link = await keepGateway({ dial: options.dial, token: options.token, ...(options.backoff === undefined ? {} : { backoff: options.backoff }) });
  const held = createHoldings(link, () => store.changed());
  const store = createStore(startingModel(options.homes), {
    noticeMs: options.noticeMs ?? NOTICE_MS,
    worked(model) {
      held.followChannels();
      holdOpen(model);
      return worked(model, held, link);
    },
    follow: () => followModel(),
  });
  const stopLink = link.onChange(() => store.changed());
  const moves = createMoves(store, held);
  const sending = createSending(store, held, moves, options.sendMs ?? SEND_MS);
  const asking = createAsking(store, held, options.now ?? Date.now);
  let closed = false;
  let looking = false;

  /** Hold what is open, and let go of what was held for what was open before: the agent whose list is open, the open thread, and the sessions they need. */
  function holdOpen(model: Model): void {
    const { item } = model.open;
    held.useAgent(agentOfList(model.open));
    held.useThread(item?.kind === "thread" ? item.thread : undefined);
    const sessions = sessionsOpen(model);
    held.useSessions(sessions?.address, sessions?.agents ?? new Set());
  }

  /**
   * While the person is looking at the open thread, move its read mark up to
   * its newest message when anything in it is new to them, once for each
   * message. One that fails is moved again when the thread next changes. When
   * the person comes to the thread, on opening it or on looking again, the
   * first message that is new to them is kept, so that what came while they
   * were away stays told apart after it is read. What comes while they look is
   * not new in that way.
   */
  function markRead(): void {
    const thread = held.thread();
    const shown = thread?.held.shown();
    // Chat has not said yet what is new in the thread.
    if (!looking || thread === undefined || shown === undefined || shown.unread === null) return;
    if (!thread.met) {
      thread.met = true;
      if (shown.unread > 0) {
        thread.firstNew = firstNewOf(shown.messages, shown.unread, store.model().me?.id);
        store.changed();
      }
    }
    const newest = shown.messages.at(-1);
    if (newest === undefined || shown.unread === 0 || thread.marked === newest.id) return;
    thread.marked = newest.id;
    const failed = (): void => {
      if (thread.marked === newest.id) thread.marked = undefined;
    };
    void thread.held.calls.markRead(newest.id).then((answer) => {
      if (answer.kind !== "done") failed();
    }, failed);
  }

  /** Ask the agent whose list is open for something: what it shows, or why it could not. */
  async function askAgent<T>(ask: (calls: AgentCalls, signal: AbortSignal) => Promise<Answer<T>>): Promise<AgentRead<T>> {
    const agent = held.agent();
    const status = store.model().agent;
    try {
      if (agent === undefined || status === undefined) throw new Down({ kind: "not-linked" });
      // An agent that is still being reached is waited for, and one that can't be is not asked.
      if (status.state === "down" && status.why.kind !== "connecting") throw new Down(status.why);
      const answer = await ask(agent.held.calls, AbortSignal.timeout(ASKING_MS));
      return answer.kind === "done" ? { value: answer.value } : { problem: { said: answer.words } };
    } catch (error) {
      return { problem: problemOf(error) };
    }
  }

  /**
   * What follows from the model as it now stands: a thread that can't be had
   * says so, once each time it is opened; the thread the person is looking at
   * is marked read; the agent whose list is open is asked which model it
   * follows by default; the person is taken to the only agent there is; each agent
   * that is running is held for what it is working in; and the session on show
   * whole is read back.
   */
  function followModel(): void {
    const thread = held.thread();
    const refusal = thread?.held.shown()?.refusal;
    if (thread !== undefined && refusal !== null && refusal !== undefined && thread.told !== refusal.words) {
      thread.told = refusal.words;
      store.say({ kind: "not-opened", problem: { said: refusal.words } });
    }
    markRead();
    asking.learnDefault();
    const entries = agentEntries(store.model());
    moves.land(entries);
    held.callRoll(new Set(entries.filter((entry) => entry.running).map((entry) => entry.id)));
    readBack(held, store.model().open, () => store.changed());
  }

  return {
    model: () => store.model(),
    subscribe: (listener) => store.subscribe(listener),
    selectAgent: (id) => moves.selectAgent(id),
    selectRoom: (id) => moves.selectChannel({ kind: "room", id }),
    selectReadOnly: (id) => moves.selectChannel({ kind: "read-only", id }),
    openThread: (threadId) => moves.open(threadId),
    startThread: (place) => sending.startThread(place),
    turnOver: () => moves.turnOver(),
    showView: (agent) => moves.showView(agent),
    openSession: (address) => moves.openSession(address),
    look(yes) {
      if (looking === yes) return;
      looking = yes;
      // What comes while the person looks away is new to them when they look again.
      const thread = held.thread();
      if (!yes && thread !== undefined) thread.met = false;
      store.changed();
    },
    async joinRoom() {
      const model = store.model();
      const { item } = model.open;
      const room = item?.kind === "thread" && item.place.kind === "read-only" ? model.readOnly[item.place.id]?.channel : undefined;
      if (room?.kind !== "room" || model.me === undefined) return;
      const me = model.me.id;
      try {
        if (model.chat.state === "down") throw new Down(model.chat.why);
        const answered = AbortSignal.timeout(options.sendMs ?? SEND_MS);
        await held.onChannel(room.id, async (channel) => valueOf(await channel.calls.addMembers([me], answered)));
      } catch (error) {
        store.say({ kind: "not-joined", problem: problemOf(error) });
      }
    },
    async write(text) {
      const { item } = store.model().open;
      const written = item?.kind === "thread" ? writtenIn(text, item.place.kind === "agent" ? "dm" : "room") : ({ do: "post" } as const);
      switch (written.do) {
        case "status":
          void asking.readStatus();
          return true;
        case "model":
          void asking.showModel();
          return true;
        case "devices":
          asking.readDevices();
          return true;
        case "take-back":
          void asking.takeBack(written.device);
          return true;
        case "refuse":
          store.say(written.notice);
          return false;
        case "post":
          return sending.send(text);
      }
    },
    send: (text) => sending.send(text),
    note: (notice) => store.say(notice),
    readStatus: () => asking.readStatus(),
    readDevices: () => asking.readDevices(),
    takeBack: (written) => asking.takeBack(written),
    models: () => asking.models(),
    showModel: () => asking.showModel(),
    folder: (path) => askAgent((calls, signal) => calls.folder(path, signal)),
    file: (path) => askAgent((calls, signal) => calls.file(path, signal)),
    trigger: (name) => askAgent((calls, signal) => calls.trigger(name, signal)),
    farewell: () => farewellOf(store.model()),
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
