import { randomUUID } from "node:crypto";
import { type AgentModels, MAX_READ, type SessionItem, type SessionPage } from "../../../contracts/agent/index.ts";
import { valueOf } from "../../../contracts/gateway/index.ts";
import type { GatewayPlace } from "../../../contracts/gateway/node.ts";
import { createListeners } from "../../../lib/listeners/index.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import {
  type AgentCalls,
  type AgentShown,
  type ChannelCalls,
  type ChannelShown,
  CONNECTING,
  Down,
  holdAgent,
  holdChannel,
  holdChat,
  type Holding,
  holdRoster,
  holdSession,
  holdThread,
  keepGateway,
  problemOf,
  type SessionCalls,
  type SessionShown,
  type ThreadCalls,
  type ThreadShown,
} from "../network/index.ts";
import { channelsOf } from "./channels.ts";
import {
  type AgentEntry,
  agentEntries,
  agentLookedAt,
  agentOfThread,
  type Farewell,
  type HomeLookup,
  listedIn,
  type Model,
  type Notice,
  openedThread,
  type Place,
  readOnlyEntries,
  type SendResult,
  type SessionView,
  type ThreadView,
  type Where,
  workingIn,
} from "./model.ts";
import { devicesOf, statusOf } from "./status.ts";

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

/** A place as a string, for telling one from another. */
const placeKey = (place: Place): string => (place.kind === "agent" ? `agent ${place.name}` : `${place.kind} ${place.id}`);

const NOTICE_MS = 6000;
const SEND_MS = 20_000;
/** How long the models an agent said it can use are kept before it is asked again. A list is narrowed by typing, and each key asks for the list. */
const MODELS_KEPT_MS = 10_000;
/** How long an agent is waited for to say its models. The editor asks for one list at a time, so one that never came would hold up every key after it. */
const MODELS_WAIT_MS = 3000;
/** How long taking back a device waits for the gateway. */
const TAKE_BACK_MS = 10_000;
/** The most items of a session shown at once, which are its newest: a watch reads back from where the window starts to as many. */
const SHOWN_ITEMS = 200;

export async function createConsoleState(options: ConsoleStateOptions): Promise<ConsoleState> {
  const noticeMs = options.noticeMs ?? NOTICE_MS;
  const sendMs = options.sendMs ?? SEND_MS;
  const clock = options.now ?? Date.now;
  const listeners = createListeners<Model>(() => undefined);
  let closed = false;

  const link = await keepGateway({ place: options.place, token: options.token, ...(options.backoff === undefined ? {} : { backoff: options.backoff }) });

  let model: Model = {
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
    homes: options.homes,
  };

  // Counts the readings of `/status` that were asked for or dropped, so that one still on its way when the person moves on or sends a message is not shown.
  let statusReads = 0;
  const set = (patch: Partial<Model>): void => {
    if (closed) return;
    // What `/status` read is for the thread it was read in, so going anywhere else ends it.
    const moved = patch.where !== undefined;
    if (moved) statusReads += 1;
    model = { ...model, ...(moved ? { status: undefined } : {}), ...patch };
    listeners.notify(model);
    changed();
  };

  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (notice: Notice | undefined): void => {
    clearTimeout(noticeTimer);
    set({ notice });
    if (notice !== undefined) noticeTimer = setTimeout(() => set({ notice: undefined }), noticeMs);
  };

  // What changed in the objects held is worked into the model once for all the changes of one turn of the event loop.
  let scheduled = false;
  function changed(): void {
    if (scheduled || closed) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!closed) refresh();
    });
  }

  const roster = holdRoster(link, changed);
  const chat = holdChat(link, changed);
  const stopLink = link.onChange(changed);
  /** Each channel the person is in or only reads, held for its threads. */
  const channels = new Map<string, Holding<ChannelShown, ChannelCalls>>();
  /** The agent whose screen, or whose thread or session, is on show. */
  let selected: { name: string; held: Holding<AgentShown, AgentCalls> } | undefined;
  /** Each running agent, held for what it is working in, while the list of agents is on show. */
  const rollCall = new Map<string, Holding<AgentShown, AgentCalls>>();
  /** The open thread. */
  let thread: { id: string; held: Holding<ThreadShown, ThreadCalls>; told: string | undefined } | undefined;
  /** The session on show, and what was read of it before its window. */
  let session:
    | {
        agent: string;
        address: string;
        held: Holding<SessionShown, SessionCalls>;
        /** The items read back from `from`, the entry the window started after, and the entry before the oldest of them. */
        older: { from: number; items: SessionItem[]; before: number | null } | undefined;
        reading: number | undefined;
      }
    | undefined;

  // Whether the person has been taken to the only agent there is, or has found their own way.
  let landed = false;

  const linkedChat = (): boolean => model.listing?.programs.some((program) => program.kind === "chat") ?? false;
  const linkedAgent = (name: string): boolean =>
    model.listing?.programs.some((program) => program.kind === "agent" && program.name === name) ?? false;

  /** Hold the channels chat lists to the person, and let go of those it no longer lists. */
  function followChannels(): void {
    const shown = chat.shown();
    if (shown === undefined) return;
    const wanted = new Set([...shown.channels, ...shown.readOnlyChannels].map((channel) => channel.id));
    for (const [id, held] of channels) {
      if (wanted.has(id)) continue;
      held.release();
      channels.delete(id);
    }
    for (const id of wanted) if (!channels.has(id)) channels.set(id, holdChannel(link, id, changed));
  }

  /**
   * While the list of agents is on show, each agent that is running is held for
   * what it is working in, and none is when it is not. It waits for the person to
   * have been taken to the only agent there is, or to have found their own way,
   * so that a console that opens on that agent does not hold every agent first.
   */
  function tend(entries: AgentEntry[]): void {
    const wanted = new Set(model.where.screen === "agents" && landed ? entries.filter((entry) => entry.running).map((entry) => entry.name) : []);
    for (const [name, held] of rollCall) {
      if (wanted.has(name)) continue;
      held.release();
      rollCall.delete(name);
    }
    for (const name of wanted) if (!rollCall.has(name)) rollCall.set(name, holdAgent(link, name, changed));
  }

  /** What each agent of the roll call is working in, as it lists it: an agent that is not reached, refuses or works in nothing has no entry. */
  function workingNow(): Model["workingSessions"] {
    const working: Model["workingSessions"] = {};
    for (const [name, held] of rollCall) {
      const shown = held.shown();
      if (held.status(linkedAgent(name)).state !== "up" || shown === undefined || shown.refusal !== null) continue;
      const now = shown.sessions.filter((each) => each.working);
      if (now.length > 0) working[name] = now;
    }
    return working;
  }

  /** Whether the session on show is watched whole, which reads back from where its window starts. */
  const watchedWhole = (where: Where): boolean => where.screen === "session" || (where.screen === "thread" && where.turned === true);

  /** The session on show as a view, with what was read back before its window when that follows on from it. */
  function sessionViewOf(): SessionView | undefined {
    const shown = session?.held.shown();
    if (session === undefined || shown === undefined || shown.refusal !== null || shown.status === null) return undefined;
    const { window } = shown;
    const older = session.older;
    if (window.before === null || older === undefined || older.from !== window.before || !watchedWhole(model.where)) {
      return { items: window.items, before: window.before, status: shown.status };
    }
    return { items: [...older.items, ...window.items], before: older.before, status: shown.status };
  }

  /**
   * Read the session on show back from where its window starts, page after page,
   * until as many items are shown as a watch shows or the session's start is
   * reached, when it is watched whole and its window has moved since the last read.
   */
  function readBack(): void {
    const watched = session;
    const shown = watched?.held.shown();
    if (watched === undefined || shown === undefined || shown.refusal !== null || !watchedWhole(model.where)) return;
    const from = shown.window.before;
    if (from === null || watched.older?.from === from || watched.reading === from) return;
    watched.reading = from;
    const wanted = SHOWN_ITEMS - shown.window.items.length;
    void (async () => {
      let items: SessionItem[] = [];
      let before: number | null = from;
      while (before !== null && items.length < wanted) {
        const page: SessionPage = valueOf(await watched.held.calls.read(before, MAX_READ));
        items = [...page.items, ...items];
        before = page.before;
      }
      return { items, before };
    })().then(
      (read) => {
        if (session !== watched || watched.reading !== from) return;
        watched.reading = undefined;
        watched.older = { from, ...read };
        changed();
      },
      () => {
        // A read that failed is tried again when the window moves, or the session is shown again. The window alone stands.
        if (session === watched && watched.reading === from) watched.reading = undefined;
      },
    );
  }

  /** Work what the held objects show into the model, then do what follows from it. */
  function refresh(): void {
    const shownRoster = roster.shown();
    const version = link.version() ?? model.listing?.version ?? "";
    const listing = shownRoster === undefined ? model.listing : { ...shownRoster, version };
    model = { ...model, listing };
    followChannels();
    const shownChat = chat.shown();
    const entries = agentEntries({ ...model, listing });
    const { dms, rooms, readOnly } = channelsOf(
      shownChat?.channels ?? [],
      shownChat?.readOnlyChannels ?? [],
      (id) => channels.get(id)?.shown(),
      entries,
    );

    // A room the person joins while reading it is theirs from then on: the screen becomes the room's.
    let { where } = model;
    if ((where.screen === "threads" || where.screen === "thread") && where.place.kind === "read-only" && rooms[where.place.id] !== undefined) {
      where = { ...where, place: { kind: "room", id: where.place.id } };
    }

    const agentShown = selected?.held.shown();
    const listingAgent = where.screen === "threads" && where.place.kind === "agent";
    const shownSession = session?.held.shown();
    let refusal: string | undefined;
    if (listingAgent && agentShown?.refusal !== null && agentShown?.refusal !== undefined) refusal = agentShown.refusal.words;
    if (where.screen === "session" && shownSession?.refusal !== null && shownSession?.refusal !== undefined) refusal = shownSession.refusal.words;

    const shownThread = thread?.held.shown();
    let threadView: ThreadView | undefined;
    if (shownThread !== undefined && shownThread.refusal === null && shownThread.thread !== null) {
      const { thread: record, messages, earlier, readOnly: only } = shownThread;
      threadView = { thread: record, messages, earlier, readOnly: only };
    }

    model = {
      ...model,
      where,
      gateway: link.status(),
      chat: chat.status(linkedChat()),
      me: shownChat?.you ?? model.me,
      dms,
      rooms,
      readOnly,
      agent: selected === undefined ? undefined : selected.held.status(linkedAgent(selected.name)),
      sessions: agentShown === undefined || agentShown.refusal !== null ? undefined : agentShown.sessions,
      refusal,
      thread: threadView,
      session: sessionViewOf(),
      workingSessions: workingNow(),
    };
    listeners.notify(model);

    // A thread that can't be had says so, once.
    if (thread !== undefined && shownThread?.refusal !== null && shownThread?.refusal !== undefined && thread.told !== shownThread.refusal.words) {
      thread.told = shownThread.refusal.words;
      say({ kind: "not-opened", problem: { said: shownThread.refusal.words } });
    }
    land(entries);
    tend(entries);
    readBack();
  }

  /** With one agent and no room to choose from, the person is taken to the agent, once chat has said which channels they have. */
  function land(entries: AgentEntry[]): void {
    if (landed || chat.shown() === undefined || entries.length === 0) return;
    landed = true;
    const [only] = entries;
    const channelsToChoose = Object.keys(model.rooms).length + readOnlyEntries(model).length;
    if (only !== undefined && entries.length === 1 && channelsToChoose === 0 && model.where.screen === "agents") select(only.name);
  }

  /** Hold the agent called `name`, and let go of any other, or of every one with none. */
  function useAgent(name: string | undefined): void {
    if (selected?.name === name) return;
    selected?.held.release();
    selected = name === undefined ? undefined : { name, held: holdAgent(link, name, changed) };
  }

  /** Hold the thread `id`, and let go of any other, or of every one with none. */
  function useThread(id: string | undefined): void {
    if (thread?.id === id) return;
    thread?.held.release();
    thread = id === undefined ? undefined : { id, held: holdThread(link, id, changed), told: undefined };
  }

  /** Hold the session at `address` of the agent `agent`, and let go of any other, or of every one with none. */
  function useSession(agent: string | undefined, address: string | undefined): void {
    if (session?.agent === agent && session?.address === address) return;
    session?.held.release();
    session =
      agent === undefined || address === undefined
        ? undefined
        : { agent, address, held: holdSession(link, agent, address, changed), older: undefined, reading: undefined };
  }

  function select(name: string): void {
    landed = true;
    useAgent(name);
    useThread(undefined);
    useSession(undefined, undefined);
    set({ where: { screen: "threads", place: { kind: "agent", name } }, thread: undefined, session: undefined, refusal: undefined, notice: undefined });
  }

  function selectChannel(place: Extract<Place, { id: string }>): void {
    landed = true;
    useAgent(undefined);
    useThread(undefined);
    useSession(undefined, undefined);
    set({ where: { screen: "threads", place }, thread: undefined, session: undefined, notice: undefined });
  }

  function open(threadId: string | undefined): void {
    const { where } = model;
    if (where.screen !== "threads" && where.screen !== "thread") return;
    // A channel the person only reads takes no new thread.
    if (threadId === undefined && where.place.kind === "read-only") return;
    landed = true;
    const next = openedThread(model, where, threadId);
    useThread(threadId);
    const agent = next.screen === "thread" ? agentOfThread(next) : undefined;
    useSession(threadId === undefined ? undefined : agent, threadId);
    set({ where: next, thread: undefined, session: undefined, notice: undefined });
  }

  // The thread a person started and could not send a first message in, so that trying again does not make another.
  let started: { place: string; threadId: string } | undefined;
  // The message being sent, so that sending the same again after a failure is the same message.
  let pending: { threadId: string; text: string; requestId: string } | undefined;
  // Which new thread is on screen, so that a first message that arrives late does not open it over something else.
  let newThreads = 0;

  /** The person's devices, from the roster as it is now. */
  const devicesNow = (): { label: string | null; id: string }[] => devicesOf(model);

  // The models an agent said it can use, and when. A clock that only goes forward keeps them, so a changed system time cannot.
  let kept: { agent: string; at: number; models: AgentModels } | undefined;

  /**
   * The models the agent held as `held` can use: what it said in the last few
   * seconds, or else what it says when asked. Undefined when it says nothing
   * in time, or refuses; that is not kept, so the next key asks again.
   */
  async function modelsOf(name: string, held: Holding<AgentShown, AgentCalls>): Promise<AgentModels | undefined> {
    if (kept?.agent === name && performance.now() - kept.at < MODELS_KEPT_MS) return kept.models;
    const waiting = AbortSignal.timeout(MODELS_WAIT_MS);
    const answer = await held.calls.models(waiting).catch(() => undefined);
    if (answer?.kind !== "done") return undefined;
    kept = { agent: name, at: performance.now(), models: answer.value };
    return answer.value;
  }

  /** The agent on the roster that is called `name`. */
  const rosterAgent = (name: string): AgentEntry => {
    const found = agentEntries(model).find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`${name} is not on the roster.`);
    return found;
  };

  /**
   * The ID of the channel a new thread goes in: the person's DM with the agent,
   * which is made if they have none, or the room, which the console never makes.
   */
  async function channelOf(place: Exclude<Place, { kind: "read-only" }>, signal: AbortSignal): Promise<string> {
    if (place.kind === "room") {
      if (model.rooms[place.id] === undefined) throw new Error("You are not in that room.");
      return place.id;
    }
    const dm = model.dms[place.name];
    if (dm !== undefined) return dm.channel.id;
    return valueOf(await chat.calls.openDm(rosterAgent(place.name).id, signal)).id;
  }

  /** Make a new thread in the channel `channelId`, holding the channel only while it does. */
  async function newThreadIn(channelId: string, signal: AbortSignal): Promise<string> {
    const held = channels.get(channelId) ?? holdChannel(link, channelId, () => undefined);
    try {
      return valueOf(await held.calls.createThread(null, signal)).id;
    } finally {
      if (!channels.has(channelId)) held.release();
    }
  }

  /** Post in the thread `threadId`, holding it only while it does unless it is the open thread. */
  async function postIn(threadId: string, text: string, requestId: string, signal: AbortSignal): Promise<void> {
    const held = thread?.id === threadId ? thread.held : holdThread(link, threadId, () => undefined);
    try {
      valueOf(await held.calls.post(text, requestId, signal));
    } finally {
      if (thread?.held !== held) held.release();
    }
  }

  return {
    model: () => model,
    subscribe: (listener) => listeners.add(listener),

    selectAgent: select,
    selectRoom: (id) => selectChannel({ kind: "room", id }),
    selectReadOnly: (id) => selectChannel({ kind: "read-only", id }),
    openThread: (threadId) => open(threadId),
    startThread() {
      newThreads += 1;
      started = undefined;
      open(undefined);
    },
    turnOver() {
      const { where } = model;
      if (where.screen !== "thread" || where.thread === undefined || agentOfThread(where) === undefined) return;
      // A thread with no session behind it has nothing to turn over to; one that is turned over can always be turned back.
      if (where.turned !== true && model.session === undefined) return;
      set({ where: { ...where, turned: where.turned !== true }, notice: undefined });
    },
    openSession(address) {
      const { where } = model;
      if (where.screen !== "threads" || where.place.kind !== "agent") return;
      useThread(undefined);
      useSession(where.place.name, address);
      set({ where: { screen: "session", agent: where.place.name, session: address }, session: undefined, notice: undefined, refusal: undefined });
    },
    back() {
      const { where } = model;
      if (where.screen === "thread" || where.screen === "session") {
        useThread(undefined);
        useSession(undefined, undefined);
        set({ where: { screen: "threads", place: listedIn(where) }, thread: undefined, session: undefined, notice: undefined, refusal: undefined });
      } else if (where.screen === "threads") {
        useAgent(undefined);
        set({ where: { screen: "agents" }, agent: undefined, sessions: undefined, notice: undefined, refusal: undefined });
      }
    },

    async send(text) {
      const { where } = model;
      // The chat server refuses a write in a channel the person only reads, so nothing is asked of it.
      if (where.screen !== "thread" || where.place.kind === "read-only") return { ok: false };
      const { place } = where;
      const newThread = newThreads;
      // A chat server that has stopped answering must not leave the message in limbo. Sending it again is safe either way.
      const answered = AbortSignal.timeout(sendMs);
      try {
        if (model.chat.state === "down") throw new Down(model.chat.why);
        let threadId = where.thread ?? (started?.place === placeKey(place) ? started.threadId : undefined);
        if (threadId === undefined) {
          threadId = await newThreadIn(await channelOf(place, answered), answered);
          started = { place: placeKey(place), threadId };
        }
        const requestId = pending?.threadId === threadId && pending.text === text ? pending.requestId : randomUUID();
        pending = { threadId, text, requestId };
        await postIn(threadId, text, requestId, answered);
        pending = undefined;
        // A message that is sent ends what `/status` read.
        statusReads += 1;
        if (model.status !== undefined) set({ status: undefined });
        if (where.thread === undefined) {
          started = undefined;
          const now = model.where;
          if (now.screen === "thread" && now.thread === undefined && newThreads === newThread) open(threadId);
        }
        return { ok: true };
      } catch (error) {
        const silent = answered.aborted ? new Down({ kind: "unreachable", message: "the chat server did not answer" }) : error;
        say({ kind: "not-sent", problem: problemOf(silent) });
        return { ok: false };
      }
    },

    note: (notice) => say(notice),

    async readStatus() {
      const { where } = model;
      if (where.screen !== "thread") return;
      statusReads += 1;
      const read = statusReads;
      const asking = where.place.kind === "agent" && selected !== undefined && model.agent?.state === "up" ? selected : undefined;
      // The agent is asked which model is its default, when the thread's is not that one. It may not answer.
      const own = model.session?.status.ownModel === true;
      const models = own && asking !== undefined ? await modelsOf(asking.name, asking.held) : undefined;
      const sessions = asking === undefined ? undefined : model.sessions;
      if (read === statusReads) set({ status: statusOf(model, sessions, clock(), models?.default) });
    },

    readDevices() {
      if (model.where.screen !== "thread") return;
      statusReads += 1;
      set({ status: { at: clock(), about: { kind: "devices", devices: devicesNow() } } });
    },

    async takeBack(written) {
      const devices = devicesNow();
      const wanted = written.trim().toLowerCase();
      const byId = devices.filter((device) => device.id.toLowerCase() === wanted);
      const named = byId.length > 0 ? byId : devices.filter((device) => device.label?.toLowerCase() === wanted);
      if (named.length === 0) {
        say({ kind: "no-device", written: written.trim(), devices: devices.map((device) => device.label ?? device.id) });
        return;
      }
      const [device] = named;
      if (named.length > 1 || device === undefined) {
        say({ kind: "devices-alike", written: written.trim() });
        return;
      }
      try {
        if (model.gateway.state === "down") throw new Down(model.gateway.why);
        valueOf(await roster.calls.takeBack(device.id, AbortSignal.timeout(TAKE_BACK_MS)));
      } catch (error) {
        say({ kind: "not-taken-back", problem: problemOf(error) });
        return;
      }
      if (model.status?.about.kind === "devices") {
        const left = devicesNow().filter((each) => each.id !== device.id);
        set({ status: { at: clock(), about: { kind: "devices", devices: left } } });
      }
      say({ kind: "taken-back", device: device.label ?? device.id });
    },

    async models() {
      const { where } = model;
      const asking = selected;
      if (where.screen !== "thread" || where.place.kind !== "agent" || asking === undefined || model.agent?.state !== "up") return undefined;
      return modelsOf(asking.name, asking.held);
    },

    async showModel() {
      const { where } = model;
      const asking = selected;
      // A room's thread has no one agent whose model this could be, even when it was opened from an agent's screen.
      if (where.screen !== "thread" || where.place.kind !== "agent" || asking === undefined) return;
      const { thread: threadId } = where;
      // Where the person is changes while the agent is asked, which the compiler cannot see. What the agent said is for the thread it was asked in.
      const stillHere = (): boolean => selected === asking && model.where.screen === "thread" && model.where.thread === threadId;
      const tell = (notice: Notice): void => {
        if (stillHere()) say(notice);
      };

      const status = model.agent;
      if (status?.state === "down") return tell({ kind: "model-not-shown", problem: { down: status.why } });
      const view = threadId === undefined ? undefined : model.session;
      if (view === undefined) return tell({ kind: "model-unstarted", defaultModel: (await modelsOf(asking.name, asking.held))?.default });
      const { model: used, ownModel } = view.status;
      // The default is worth asking for when the thread's model is not it.
      const defaultModel = ownModel ? (await modelsOf(asking.name, asking.held))?.default : undefined;
      tell({ kind: "model-is", model: used, own: ownModel, defaultModel });
    },

    async farewell() {
      const { where } = model;
      const entries = agentEntries(model);
      // A thread of a room has no one agent to name, unless it was opened from an agent's screen.
      const shown = agentLookedAt(where);
      const names = [...(shown === undefined ? [] : [shown]), ...entries.map((entry) => entry.name)];
      for (const name of new Set(names)) {
        // The thread on screen comes first, then the newest thread the agent is working in.
        const id = entries.find((entry) => entry.name === name)?.id;
        if (id === undefined) continue;
        // A session that was working when the agent went away is not working now, whatever its last view says.
        const sessionWorking = model.session?.status.busy === true && model.agent?.state === "up";
        const onScreen =
          where.screen === "thread" && shown === name && where.thread !== undefined
            ? { thread: where.thread, working: sessionWorking || model.thread?.thread.working.some((mark) => mark.memberId === id) === true }
            : undefined;
        if (onScreen?.working === true) return { agent: name, thread: onScreen.thread };
        const working = model.dms[name]?.threads.find((each) => workingIn(each, id));
        if (working !== undefined) return { agent: name, thread: working.id };
      }
      return undefined;
    },

    async close() {
      if (closed) return;
      closed = true;
      clearTimeout(noticeTimer);
      listeners.clear();
      stopLink();
      for (const held of rollCall.values()) held.release();
      for (const held of channels.values()) held.release();
      selected?.held.release();
      thread?.held.release();
      session?.held.release();
      chat.release();
      roster.release();
      await link.close();
    },
  };
}
