import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { agentMember, type Member } from "../../../contracts/chat/index.ts";
import { createListeners } from "../../../lib/listeners/index.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import {
  type AgentLink,
  CONNECTING,
  converge,
  Down,
  keepAgent,
  keepChat,
  keepRegistry,
  problemOf,
  type SessionUpdate,
  type ThreadUpdate,
  type Transports,
} from "../network/index.ts";
import { readDms } from "./directory.ts";
import {
  type AgentEntry,
  agentEntries,
  type Farewell,
  type Model,
  type Notice,
  type SendResult,
  workingIn,
} from "./model.ts";

export interface ConsoleStateOptions {
  /** You, as the chat server knows you. */
  me: Member;
  /** How the console reaches the gateway, and the programs it lists. */
  transports: Transports;
  /** How often what has no subscription is asked for again: what is running, and the threads in the person's DMs. 2 seconds by default. */
  pollMs?: number;
  /** How long a notice stays. 6 seconds by default. */
  noticeMs?: number;
  /** How long sending a message waits for the chat server before saying it was not sent. 20 seconds by default. */
  sendMs?: number;
  /** The pauses between attempts to reach a program. Tests shorten them. */
  backoff?: Backoff;
}

/** What the console knows and can do, without a terminal. */
export interface ConsoleState {
  model(): Model;
  /** Tell `listener` after each change. Returns what stops that. */
  subscribe(listener: (model: Model) => void): () => void;

  /** Show an agent's threads. */
  selectAgent(name: string): void;
  /** Open one of the selected agent's threads, to talk and watch the work. */
  openThread(threadId: string): void;
  /** Start a thread with the selected agent. It comes to be with its first message. */
  startThread(): void;
  /** Go up one level: from a thread to the agent's threads, and from those to the agents. */
  back(): void;

  /** Say something in the open thread, or in a new one. The person's draft is theirs to put back when it fails. */
  send(text: string): Promise<SendResult>;
  /** Stop the work in the session behind the open thread, for everyone. */
  stop(): Promise<void>;

  /** The work that goes on if the console is left now, if there is any. It asks chat once more, briefly. */
  farewell(): Promise<Farewell | undefined>;
  /** Let go of every connection. The work in agents goes on. */
  close(): Promise<void>;
}

const POLL_MS = 2000;
const NOTICE_MS = 6000;
const SEND_MS = 20_000;
/** How long leaving waits for chat to say who is working. */
const FAREWELL_MS = 500;

export function createConsoleState(options: ConsoleStateOptions): ConsoleState {
  const pollMs = options.pollMs ?? POLL_MS;
  const noticeMs = options.noticeMs ?? NOTICE_MS;
  const sendMs = options.sendMs ?? SEND_MS;
  const listeners = createListeners<Model>(() => undefined);
  let closed = false;

  let model: Model = {
    me: options.me,
    where: { screen: "agents" },
    gateway: CONNECTING,
    listing: undefined,
    chat: CONNECTING,
    agent: undefined,
    dms: {},
    thread: undefined,
    session: undefined,
    notice: undefined,
  };
  const set = (patch: Partial<Model>): void => {
    if (closed) return;
    model = { ...model, ...patch };
    listeners.notify(model);
  };

  let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const say = (notice: Notice | undefined): void => {
    clearTimeout(noticeTimer);
    set({ notice });
    if (notice !== undefined) noticeTimer = setTimeout(() => set({ notice: undefined }), noticeMs);
  };

  // Whether the person has been taken to the only agent there is, or has found their own way.
  let landed = false;

  const registry = keepRegistry({ transports: options.transports, pollMs, backoff: options.backoff });

  const onThread = (update: ThreadUpdate): void => {
    const { where } = model;
    if (where.screen !== "thread" || where.thread !== update.threadId) return;
    if ("view" in update) set({ thread: update.view });
    else say({ kind: "not-opened", problem: update.problem });
  };
  const chat = keepChat({
    me: options.me,
    registry,
    transports: options.transports,
    backoff: options.backoff,
    onThread,
  });

  let agent: AgentLink | undefined;
  const closing: Promise<void>[] = [];
  const useAgent = (name: string | undefined): void => {
    if (agent?.name === name) return;
    if (agent !== undefined) closing.push(agent.close());
    if (name === undefined) {
      agent = undefined;
      set({ agent: undefined, session: undefined });
      return;
    }
    const link: AgentLink = keepAgent({
      name,
      registry,
      transports: options.transports,
      pollMs,
      backoff: options.backoff,
      onSession(update: SessionUpdate) {
        const { where } = model;
        if (agent !== link || where.screen !== "thread" || where.thread !== update.threadId) return;
        if ("view" in update) set({ session: update.view });
        else say({ kind: "not-watched", problem: update.problem });
      },
    });
    link.onStatus((status) => {
      if (agent === link) set({ agent: status });
    });
    agent = link;
    set({ agent: link.status(), session: undefined });
  };

  /** The person's DMs and the threads in them, asked for again whenever something suggests they changed. */
  const refreshDms = converge(
    async () => {
      if (chat.status().state !== "up") return;
      const names = agentEntries(model).map((entry) => entry.name);
      const dms = await chat.call((client) => readDms(client, names));
      if (JSON.stringify(dms) !== JSON.stringify(model.dms)) set({ dms });
      if (model.notice?.kind === "not-listed") say(undefined);
    },
    (error) => {
      const problem = problemOf(error);
      // A connection that is down is the status's to tell; anything else is worth a notice.
      if ("said" in problem) say({ kind: "not-listed", problem });
    },
  );

  const land = (): void => {
    if (landed) return;
    const agents: AgentEntry[] = agentEntries(model);
    if (agents.length === 0) return;
    landed = true;
    const [only] = agents;
    if (only !== undefined && agents.length === 1 && model.where.screen === "agents") select(only.name);
  };

  registry.onChange(() => {
    set({ gateway: registry.status(), listing: registry.listing() });
    land();
    void refreshDms();
  });
  chat.onStatus((status) => {
    set({ chat: status });
    if (status.state === "up") void refreshDms();
  });
  const poll = setInterval(() => void refreshDms(), pollMs);
  // The links have been trying since they were made, and may have something to say already.
  set({ gateway: registry.status(), listing: registry.listing(), chat: chat.status() });

  function select(name: string): void {
    landed = true;
    useAgent(name);
    chat.follow(undefined);
    agent?.watch(undefined);
    set({ where: { screen: "threads", agent: name }, thread: undefined, session: undefined, notice: undefined });
    void refreshDms();
  }

  function open(threadId: string | undefined): void {
    const { where } = model;
    if (where.screen === "agents") return;
    landed = true;
    chat.follow(threadId);
    agent?.watch(threadId);
    set({ where: { screen: "thread", agent: where.agent, thread: threadId }, thread: undefined, session: undefined, notice: undefined });
  }

  // The thread a person started and could not send a first message in, so that trying again does not make another.
  let started: { agent: string; threadId: string } | undefined;
  // The message being sent, so that sending the same again after a failure is the same message.
  let pending: { threadId: string; text: string; requestId: string } | undefined;
  // Which new thread is on screen, so that a first message that arrives late does not open it over something else.
  let newThreads = 0;

  return {
    model: () => model,
    subscribe: (listener) => listeners.add(listener),

    selectAgent: select,
    openThread: (threadId) => open(threadId),
    startThread() {
      newThreads += 1;
      started = undefined;
      open(undefined);
    },
    back() {
      const { where } = model;
      if (where.screen === "thread") {
        chat.follow(undefined);
        agent?.watch(undefined);
        set({ where: { screen: "threads", agent: where.agent }, thread: undefined, session: undefined, notice: undefined });
        void refreshDms();
      } else if (where.screen === "threads") {
        useAgent(undefined);
        set({ where: { screen: "agents" }, notice: undefined });
      }
    },

    async send(text) {
      const { where } = model;
      if (where.screen !== "thread") return { ok: false };
      const newThread = newThreads;
      // A chat server that has stopped answering must not leave the message in limbo. Sending it again is safe either way.
      const answered = AbortSignal.timeout(sendMs);
      try {
        const threadId = await chat.call(async (client) => {
          let id = where.thread ?? (started?.agent === where.agent ? started.threadId : undefined);
          if (id === undefined) {
            const dm = model.dms[where.agent]?.channel ?? (await client.openDm(agentMember(where.agent), answered));
            id = (await client.createThread(dm.id, null, answered)).id;
            started = { agent: where.agent, threadId: id };
          }
          const requestId =
            pending?.threadId === id && pending.text === text ? pending.requestId : randomUUID();
          pending = { threadId: id, text, requestId };
          await client.post(id, text, requestId, answered);
          pending = undefined;
          return id;
        });
        if (where.thread === undefined) {
          started = undefined;
          const now = model.where;
          if (now.screen === "thread" && now.thread === undefined && newThreads === newThread) open(threadId);
        }
        void refreshDms();
        return { ok: true };
      } catch (error) {
        const silent = answered.aborted ? new Down({ kind: "unreachable", message: "the chat server did not answer" }) : error;
        say({ kind: "not-sent", problem: problemOf(silent) });
        return { ok: false };
      }
    },

    async stop() {
      const { where } = model;
      if (where.screen !== "thread" || where.thread === undefined || agent === undefined) return;
      const thread = model.thread?.thread ?? model.dms[where.agent]?.threads.find((each) => each.id === where.thread);
      const working = model.session?.status.busy === true || (thread !== undefined && workingIn(thread, where.agent));
      if (!working) {
        say({ kind: "nothing-to-stop" });
        return;
      }
      try {
        say((await agent.stop()) ? { kind: "stopped" } : { kind: "nothing-to-stop" });
      } catch (error) {
        say({ kind: "not-stopped", problem: problemOf(error) });
      }
    },

    async farewell() {
      const waiting = new AbortController();
      await Promise.race([refreshDms(), delay(FAREWELL_MS, undefined, { signal: waiting.signal }).catch(() => undefined)]);
      waiting.abort();
      const { where } = model;
      const names = [...(where.screen === "agents" ? [] : [where.agent]), ...agentEntries(model).map((entry) => entry.name)];
      for (const name of new Set(names)) {
        // The thread on screen comes first, then the newest thread the agent is working in.
        const { id } = agentMember(name);
        const onScreen =
          where.screen === "thread" && where.agent === name && where.thread !== undefined
            ? { thread: where.thread, working: model.session?.status.busy === true || model.thread?.thread.working.some((mark) => mark.memberId === id) === true }
            : undefined;
        if (onScreen?.working === true) return { agent: name, thread: onScreen.thread };
        const working = model.dms[name]?.threads.find((thread) => workingIn(thread, name));
        if (working !== undefined) return { agent: name, thread: working.id };
      }
      return undefined;
    },

    async close() {
      closed = true;
      clearInterval(poll);
      clearTimeout(noticeTimer);
      listeners.clear();
      await Promise.all([chat.close(), agent?.close(), registry.close(), ...closing]);
    },
  };
}
