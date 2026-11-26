import type { AgentModel } from "../../contracts/agent/index.ts";
import { agentCommandIn, type Message } from "../../contracts/chat/index.ts";
import { type Answer, nameKey, valueOf } from "../../contracts/gateway/index.ts";
import type { Backoff } from "../../lib/retry/index.ts";
import { type AgentCalls, CONNECTING, type Dial, Down, keepGateway, problemOf } from "../network/index.ts";
import { createAsking } from "./asking.ts";
import { readBack } from "./history.ts";
import { createHoldings } from "./holdings.ts";
import {
  agentEntries,
  agentNameOf,
  agentOfList,
  type AgentRead,
  type Farewell,
  farewellOf,
  gatewayAhead,
  type HomeLookup,
  type HomeRead,
  type Model,
  NOTHING_READ,
  type Notice,
  onceTriggersIn,
  openThreadOf,
  type Place,
  processesIn,
  processOutputKey,
  sessionsOpen,
  standingTriggersIn,
  triggerFile,
  watchesIn,
} from "./model.ts";
import { createMoves } from "./moves.ts";
import { createRenaming } from "./renaming.ts";
import { createSending } from "./sending.ts";
import { createStore } from "./store.ts";
import { worked } from "./worked.ts";
import { writtenInOpen } from "./written.ts";

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
  /** Open a new thread with the only agent there is when the person is taken to it, so that what they write first starts it. */
  startOnLanding?: boolean;
  /**
   * Put the gateway's version, `version`, on this machine, as the terminal
   * does when the person writes `/update` and the machine is behind. A client
   * without it doesn't offer `/update`, as a page doesn't, since it comes from
   * the gateway.
   */
  update?: (version: string) => void;
}

/** What a client knows and can do, without a terminal or a page. */
export interface ClientState {
  model(): Model;
  /** Tell `listener` after each change. Returns what stops that. */
  subscribe(listener: (model: Model) => void): () => void;

  /** Open the list of everything an agent takes part in, by its member ID. */
  selectAgent(id: string): void;
  /** Open the list of a room the person is in, by its channel's ID. */
  selectRoom(roomId: string): void;
  /** Open the list of a channel the person is not in and only reads, by its channel's ID. */
  selectReadOnly(channelId: string): void;
  /** Open one of the threads of the open list. */
  openThread(threadId: string): void;
  /** Open a thread from the list of the agent with member ID `agentId`. */
  openFrom(agentId: string, threadId: string): void;
  /** Close what is open in the open list, so that nothing is: on an agent's list, its page stands in the thread's place. */
  closeItem(): void;
  /** Start a thread in `place`, or in the open list's own place when none is given. */
  startThread(place?: Place): void;
  /** In a thread, put the next agent's view of the session behind it on show in place of the conversation. */
  turnOver(): void;
  /** In a thread, put the view of the agent with member ID `agent` of the session behind it on show. */
  showView(agent: string): void;
  /** Say whether the person is looking at the open thread, as the client can tell. */
  look(looking: boolean): void;
  /** Join the room the open thread is in, which the person only reads. */
  joinRoom(): Promise<void>;

  /** Act on what the person wrote in the open thread. */
  write(text: string): Promise<boolean>;
  /** Say something in the open thread, or in a new one, and say whether it was sent. */
  send(text: string): Promise<boolean>;
  /** Name the open thread what `typed` says. */
  rename(typed: string): Promise<void>;
  /** Archive the open thread, or bring it back. */
  archive(archived: boolean): Promise<void>;
  /** Tell the person something that came of what they wrote, in a note that goes away by itself. */
  note(notice: Notice): void;
  /** Read what `/status` shows for the open thread. */
  readStatus(): void;
  /** Read what `/devices` shows. */
  readDevices(): void;
  /** Take back the person's device that `written` names. */
  takeBack(written: string): Promise<void>;
  /** The models the agent of the open DM thread can use now. */
  models(): Promise<AgentModel[] | undefined>;
  /** `/model` with nothing after it in the open DM thread. */
  showModel(): void;
  /** Read the entries of a folder of the home of the agent whose list is open. */
  readFolder(path: string): void;
  /** Read a file of the home of the agent whose list is open. */
  readFile(path: string): void;
  /** Read again what the page of the agent whose list is open shows of its home. */
  readPage(folders: Iterable<string>): void;
  /** Fetch the output tail of a running background command into `model.processOutputs`. */
  readProcessOutput(agentId: string, procId: string, lines?: number): void;
  /** Kill a running background command of `agentId`. */
  killProcess(agentId: string, procId: string): Promise<void>;
  /** Drop an open watch of `agentId` silently. */
  cancelWatch(agentId: string, watchId: string): Promise<void>;
  /** Cancel a pending one-shot trigger of `agentId` silently. */
  cancelTrigger(agentId: string, triggerId: string): Promise<void>;
  /** Fire a standing trigger of `agentId` now. */
  fireTrigger(agentId: string, name: string): Promise<void>;
  /** Turn a standing trigger of `agentId` on or off. */
  switchTrigger(agentId: string, name: string, on: boolean): Promise<void>;
  /** Stop the active turn in the open thread for `agentId` through `Session.stop` (for read-only threads). */
  stopSession(agentId: string): Promise<void>;

  /** The work that goes on if the client is left now, if there is any. */
  farewell(): Farewell | undefined;
  /** Let go of every object held and of the link. The work in agents goes on. */
  close(): Promise<void>;
}

const NOTICE_MS = 6000;
const SEND_MS = 20_000;
/** How long an agent is waited for to show a folder, a file, a process tail, or perform an action. */
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
  sessions: undefined,
  triggers: undefined,
  defaultModel: undefined,
  home: NOTHING_READ,
  looks: {},
  workingSessions: {},
  processesByAgent: {},
  watchesByAgent: {},
  onceTriggersByAgent: {},
  triggersByAgent: {},
  processOutputs: {},
  refusal: undefined,
  notice: undefined,
  status: undefined,
  homes,
});

/**
 * The ID of the first of `messages` that is new to the person, the member
 * `me`, when `unread` are: chat counts what others wrote after the read mark,
 * leaving out deleted messages and wake lines, so it is the `unread`th of those
 * from the end, or the earliest of them on show when fewer are.
 */
function firstNewOf(messages: readonly Message[], unread: number, me: string | undefined): string | undefined {
  let first: string | undefined;
  let counted = 0;
  for (let at = messages.length - 1; at >= 0 && counted < unread; at--) {
    const message = messages[at];
    if (message === undefined || message.deleted || message.author.id === me || message.wake !== null) continue;
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
  const moves = createMoves(store, held, options.startOnLanding === true);
  const sending = createSending(store, held, moves, options.sendMs ?? SEND_MS);
  const renaming = createRenaming(store, held, options.sendMs ?? SEND_MS);
  const asking = createAsking(store, held, options.now ?? Date.now);
  let closed = false;
  let looking = false;

  /** Hold what is open, and let go of what was held for what was open before. */
  function holdOpen(model: Model): void {
    const { item } = model.open;
    held.useAgent(agentOfList(model.open));
    held.useThread(item?.thread);
    const sessions = sessionsOpen(model);
    held.useSessions(sessions?.address, sessions?.agents ?? new Set());
  }

  function markRead(): void {
    const thread = held.thread();
    const shown = thread?.held.shown();
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
    void held.chat.calls.markRead(newest.id).then((answer) => {
      if (answer.kind !== "done") failed();
    }, failed);
  }

  /** Find a held handle for `agentId`, either as the open list's agent or from roll call. */
  function callsFor(agentId: string): AgentCalls | undefined {
    const selected = held.agent();
    if (selected?.id === agentId) return selected.held.calls;
    return held.rollCall().get(agentId)?.calls;
  }

  /** Ask an agent `agentId` for something through its held handle. */
  async function askById<T>(agentId: string, ask: (calls: AgentCalls, signal: AbortSignal) => Promise<Answer<T>>): Promise<AgentRead<T>> {
    const calls = callsFor(agentId);
    try {
      if (calls === undefined) throw new Down({ kind: "not-linked" });
      const answer = await ask(calls, AbortSignal.timeout(ASKING_MS));
      return answer.kind === "done" ? { value: answer.value } : { problem: { said: answer.words } };
    } catch (error) {
      return { problem: problemOf(error) };
    }
  }

  /** Ask the agent whose list is open for something: what it shows, or why it could not. */
  async function askAgent<T>(ask: (calls: AgentCalls, signal: AbortSignal) => Promise<Answer<T>>): Promise<AgentRead<T>> {
    const agent = held.agent();
    const status = store.model().agent;
    try {
      if (agent === undefined || status === undefined) throw new Down({ kind: "not-linked" });
      if (status.state === "down" && status.why.kind !== "connecting") throw new Down(status.why);
      const answer = await ask(agent.held.calls, AbortSignal.timeout(ASKING_MS));
      return answer.kind === "done" ? { value: answer.value } : { problem: { said: answer.words } };
    } catch (error) {
      return { problem: problemOf(error) };
    }
  }

  function readHome<T>(ask: (calls: AgentCalls, signal: AbortSignal) => Promise<Answer<T>>, keep: (home: HomeRead, read: AgentRead<T>) => HomeRead): void {
    const agent = agentOfList(store.model().open);
    void askAgent(ask).then((read) => {
      if (agentOfList(store.model().open) !== agent) return;
      store.set({ home: keep(store.model().home, read) });
    });
  }

  const readFolder = (path: string): void =>
    readHome(
      (calls, signal) => calls.folder(path, signal),
      (home, read) => ({ ...home, folders: { ...home.folders, [path]: read } }),
    );
  const readFile = (path: string): void =>
    readHome(
      (calls, signal) => calls.file(path, signal),
      (home, read) => ({ ...home, files: { ...home.files, [path]: read } }),
    );

  const readProcessOutput = (agentId: string, procId: string, lines?: number): void => {
    const key = processOutputKey(agentId, procId);
    void askById(agentId, (calls, signal) => calls.processOutput(procId, lines, signal)).then((read) => {
      store.set({ processOutputs: { ...store.model().processOutputs, [key]: read } });
    });
  };

  async function runAgentAction(
    what: Extract<Notice, { kind: "action-failed" }>["what"],
    agentId: string,
    ask: (calls: AgentCalls, signal: AbortSignal) => Promise<Answer<unknown>>,
  ): Promise<void> {
    const read = await askById(agentId, ask);
    if ("problem" in read) {
      store.say({ kind: "action-failed", what, agent: agentNameOf(store.model(), agentId), problem: read.problem });
    }
  }

  const killProcess = (agentId: string, procId: string): Promise<void> =>
    runAgentAction("kill", agentId, (calls, signal) => calls.killProcess(procId, signal));

  const cancelWatch = (agentId: string, watchId: string): Promise<void> =>
    runAgentAction("drop", agentId, (calls, signal) => calls.cancelWatch(watchId, signal));

  const cancelTrigger = (agentId: string, triggerId: string): Promise<void> =>
    runAgentAction("cancel", agentId, (calls, signal) => calls.cancelTrigger(triggerId, signal));

  const fireTrigger = (agentId: string, name: string): Promise<void> =>
    runAgentAction("fire", agentId, (calls, signal) => calls.fire(name, signal));

  const switchTrigger = (agentId: string, name: string, on: boolean): Promise<void> =>
    runAgentAction(on ? "resume" : "pause", agentId, (calls, signal) => calls.switchTrigger(name, on, signal));

  const stopSession = async (agentId: string): Promise<void> => {
    const session = held.sessions().get(agentId);
    try {
      if (session === undefined) throw new Down({ kind: "not-linked" });
      valueOf(await session.held.calls.stop(AbortSignal.timeout(ASKING_MS)));
    } catch (error) {
      store.say({ kind: "action-failed", what: "stop", agent: agentNameOf(store.model(), agentId), problem: problemOf(error) });
    }
  };

  function followModel(): void {
    const thread = held.thread();
    const refusal = thread?.held.shown()?.refusal;
    if (thread !== undefined && refusal !== null && refusal !== undefined && thread.told !== refusal.words) {
      thread.told = refusal.words;
      store.say({ kind: "not-opened", problem: { said: refusal.words } });
    }
    markRead();
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
    openFrom: (agentId, threadId) => moves.openFrom(agentId, threadId),
    closeItem: () => moves.close(),
    startThread: (place) => sending.startThread(place),
    turnOver: () => moves.turnOver(),
    showView: (agent) => moves.showView(agent),
    look(yes) {
      if (looking === yes) return;
      looking = yes;
      const thread = held.thread();
      if (!yes && thread !== undefined) thread.met = false;
      store.changed();
    },
    async joinRoom() {
      const model = store.model();
      const { item } = model.open;
      const room = item?.place.kind === "read-only" ? model.readOnly[item.place.id]?.channel : undefined;
      if (room?.kind !== "room" || model.me === undefined) return;
      const me = model.me.id;
      try {
        if (model.chat.state === "down") throw new Down(model.chat.why);
        const answered = AbortSignal.timeout(options.sendMs ?? SEND_MS);
        valueOf(await held.chat.calls.addMembers(room.id, [me], answered));
      } catch (error) {
        store.say({ kind: "not-joined", problem: problemOf(error) });
      }
    },
    async write(text) {
      const model = store.model();
      const threadId = model.open.item?.thread;
      const written = writtenInOpen(model, text, options.update !== undefined);
      switch (written.do) {
        case "status":
          asking.readStatus();
          return true;
        case "model":
          asking.showModel();
          return true;
        case "devices":
          asking.readDevices();
          return true;
        case "take-back":
          void asking.takeBack(written.device);
          return true;
        case "rename":
          void renaming.rename(written.name);
          return true;
        case "name":
          store.say({ kind: "thread-name", name: openThreadOf(model)?.name ?? null });
          return true;
        case "archive":
          void renaming.archive(written.archived);
          return true;
        case "kill": {
          const procs = threadId === undefined ? [] : processesIn(model, threadId);
          if (procs.length === 0) {
            store.say({ kind: "no-processes" });
            return true;
          }
          const matched = written.id === undefined ? (procs.length === 1 ? procs[0] : undefined) : procs.find((each) => each.process.id === written.id);
          if (matched === undefined) {
            store.say({ kind: "many-processes", ids: procs.map((each) => each.process.id) });
            return true;
          }
          void killProcess(matched.agent, matched.process.id);
          return true;
        }
        case "drop": {
          const watches = threadId === undefined ? [] : watchesIn(model, threadId);
          if (watches.length === 0) {
            store.say({ kind: "no-watches" });
            return true;
          }
          const names = [...new Set(watches.map((each) => each.watch.onAgentName))];
          const wanted = written.agent === undefined ? (names.length === 1 ? names[0] : undefined) : names.find((name) => nameKey(name) === nameKey(written.agent ?? ""));
          if (wanted === undefined) {
            store.say({ kind: "many-watches", agents: names });
            return true;
          }
          for (const each of watches.filter((item) => nameKey(item.watch.onAgentName) === nameKey(wanted))) {
            void cancelWatch(each.agent, each.watch.id);
          }
          return true;
        }
        case "cancel": {
          const onces = threadId === undefined ? [] : onceTriggersIn(model, threadId);
          if (onces.length === 0) {
            store.say({ kind: "no-triggers", action: "cancel" });
            return true;
          }
          const matched =
            written.target === undefined
              ? onces.length === 1
                ? onces[0]
                : undefined
              : onces.find((each) => each.trigger.id === written.target);
          if (matched === undefined) {
            store.say({ kind: "many-triggers", action: "cancel", names: onces.map((each) => each.trigger.id) });
            return true;
          }
          void cancelTrigger(matched.agent, matched.trigger.id);
          return true;
        }
        case "pause":
        case "resume": {
          const on = written.do === "resume";
          const matching = threadId === undefined ? [] : standingTriggersIn(model, threadId).filter((each) => each.trigger.on !== on);
          if (matching.length === 0) {
            store.say({ kind: "no-triggers", action: written.do });
            return true;
          }
          const matched =
            written.name === undefined
              ? matching.length === 1
                ? matching[0]
                : undefined
              : matching.find((each) => nameKey(each.trigger.name) === nameKey(written.name ?? ""));
          if (matched === undefined) {
            store.say({ kind: "many-triggers", action: written.do, names: matching.map((each) => each.trigger.name) });
            return true;
          }
          void switchTrigger(matched.agent, matched.trigger.name, on);
          return true;
        }
        case "update": {
          const ahead = gatewayAhead(model);
          if (ahead === undefined) store.say({ kind: "nothing-to-update", gateway: model.listing?.versions?.shrimpy });
          else options.update?.(ahead);
          return true;
        }
        case "refuse":
          store.say(written.notice);
          return false;
        case "post": {
          const isStop = agentCommandIn(text)?.command === "stop";
          const hadTurn =
            isStop &&
            threadId !== undefined &&
            ((openThreadOf(model)?.working.length ?? 0) > 0 || Object.values(model.behind).some((view) => view.reached && view.status.busy));
          const sent = await sending.send(text);
          if (sent && isStop && threadId !== undefined) {
            const nowModel = store.model();
            const procs = processesIn(nowModel, threadId).length;
            const waitingOn = [...new Set(watchesIn(nowModel, threadId).map((each) => each.watch.onAgentName))];
            const trigs = onceTriggersIn(nowModel, threadId).length + standingTriggersIn(nowModel, threadId).length;
            if (procs > 0 || waitingOn.length > 0 || trigs > 0) {
              store.say({ kind: "stop-still-going", hadTurn, processes: procs, waitingOn, triggers: trigs });
            }
          }
          return sent;
        }
      }
    },
    send: (text) => sending.send(text),
    rename: (typed) => renaming.rename(typed),
    archive: (archived) => renaming.archive(archived),
    note: (notice) => store.say(notice),
    readStatus: () => asking.readStatus(),
    readDevices: () => asking.readDevices(),
    takeBack: (written) => asking.takeBack(written),
    models: () => asking.models(),
    showModel: () => asking.showModel(),
    readFolder,
    readFile,
    readPage(folders) {
      for (const path of new Set(["", ...folders])) readFolder(path);
      for (const trigger of store.model().triggers ?? []) readFile(triggerFile(trigger.name));
    },
    readProcessOutput,
    killProcess,
    cancelWatch,
    cancelTrigger,
    fireTrigger,
    switchTrigger,
    stopSession,
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
