import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Channel, ChatClient } from "../../../contracts/chat/index.ts";
import type { Transports } from "../../../contracts/gateway/index.ts";
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
} from "../network/index.ts";
import { readChannels } from "./directory.ts";
import {
  type AgentEntry,
  agentEntries,
  agentLookedAt,
  type Farewell,
  type Model,
  type Notice,
  type Place,
  type SendResult,
  workingIn,
  workingInOpenThread,
} from "./model.ts";

export interface ConsoleStateOptions {
  /** How the console reaches the gateway, and the programs registered with it by their names. */
  transports: Transports;
  /** How often what has no subscription is asked for again: what is running, the threads in the person's DMs and rooms, and the sessions of the agent on show. 2 seconds by default. */
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
  /** Show the threads of a room the person is in, by its channel's ID. */
  selectRoom(roomId: string): void;
  /** Open one of the threads on show, to talk and, in an agent's, to watch the work. */
  openThread(threadId: string): void;
  /** Start a thread with the selected agent or in the selected room. It comes to be with its first message. */
  startThread(): void;
  /** On an agent's screen, switch between the person's threads with it and its sessions. */
  switchLists(): void;
  /** Watch one of the sessions on show, by its address. Nothing can be said or done in it. */
  openSession(address: string): void;
  /** Go up one level: from a thread or a session to the list it is in, and from that to the agents and rooms. */
  back(): void;

  /** Say something in the open thread, or in a new one. The person's draft is theirs to put back when it fails. */
  send(text: string): Promise<SendResult>;
  /** Stop the work in the session behind the open thread, for everyone, when the agent is working there. Does nothing otherwise. */
  stop(): Promise<void>;

  /** The work that goes on if the console is left now, if there is any. It asks chat once more, briefly. */
  farewell(): Promise<Farewell | undefined>;
  /** Let go of every connection. The work in agents goes on. */
  close(): Promise<void>;
}

/** A place as a string, for telling one from another. */
const placeKey = (place: Place): string => (place.kind === "agent" ? `agent ${place.name}` : `room ${place.id}`);

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
    me: undefined,
    where: { screen: "agents" },
    gateway: CONNECTING,
    listing: undefined,
    chat: CONNECTING,
    agent: undefined,
    dms: {},
    rooms: {},
    thread: undefined,
    session: undefined,
    sessions: undefined,
    refusal: undefined,
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
  // Whether the person's channels have been read yet, since without them it is not known whether they are in a room.
  let channelsRead = false;

  const registry = keepRegistry({ transports: options.transports, pollMs, backoff: options.backoff });

  const onThread = (update: ThreadUpdate): void => {
    const { where } = model;
    if (where.screen !== "thread" || where.thread !== update.threadId) return;
    if ("view" in update) set({ thread: update.view });
    else say({ kind: "not-opened", problem: update.problem });
  };
  const chat = keepChat({
    registry,
    transports: options.transports,
    backoff: options.backoff,
    onEntered: (me) => set({ me }),
    onThread,
  });

  /** The address of the session that is being watched for the screen the person is on, if there is one. */
  const watched = (where: Model["where"]): string | undefined =>
    where.screen === "thread" ? where.thread : where.screen === "session" ? where.session : undefined;

  let agent: AgentLink | undefined;
  const closing: Promise<void>[] = [];
  const useAgent = (name: string | undefined): void => {
    if (agent?.name === name) return;
    if (agent !== undefined) closing.push(agent.close());
    if (name === undefined) {
      agent = undefined;
      set({ agent: undefined, session: undefined, sessions: undefined, refusal: undefined });
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
        if (agent !== link || watched(where) !== update.session) return;
        if ("view" in update) set({ session: update.view, refusal: undefined });
        else if (where.screen === "session") {
          // The screen of a session says why it can't be watched for as long as that is so. A connection that is lost is the link's to say.
          if ("said" in update.problem) set({ refusal: update.problem.said });
        } else say({ kind: "not-watched", problem: update.problem });
      },
    });
    link.onStatus((status) => {
      if (agent !== link) return;
      set({ agent: status });
      if (status.state === "up") void refreshSessions();
    });
    agent = link;
    set({ agent: link.status(), session: undefined, sessions: undefined, refusal: undefined });
  };

  /** The person's DMs and rooms and the threads in them, asked for again whenever something suggests they changed. */
  const refreshChannels = converge(
    async () => {
      if (chat.status().state !== "up") return;
      const agents = agentEntries(model);
      const { dms, rooms } = await chat.call((client) => readChannels(client, agents));
      if (JSON.stringify(dms) !== JSON.stringify(model.dms) || JSON.stringify(rooms) !== JSON.stringify(model.rooms)) {
        set({ dms, rooms });
      }
      if (model.notice?.kind === "not-listed") say(undefined);
      channelsRead = true;
      land();
    },
    (error) => {
      const problem = problemOf(error);
      // A connection that is down is the status's to tell; anything else is worth a notice.
      if ("said" in problem) say({ kind: "not-listed", problem });
    },
  );

  // Read through a function: where the person is changes while the sessions are asked for, which the compiler cannot see.
  const sessionsOnShow = (): boolean => model.where.screen === "sessions";

  /** The sessions of the agent that is selected, asked for again for as long as they are on show. */
  const refreshSessions = converge(
    async () => {
      const link = agent;
      if (link === undefined || !sessionsOnShow() || link.status().state !== "up") return;
      const sessions = await link.sessions();
      if (agent !== link) return;
      if (JSON.stringify(sessions) !== JSON.stringify(model.sessions)) set({ sessions });
      if (sessionsOnShow() && model.refusal !== undefined) set({ refusal: undefined });
    },
    (error) => {
      const problem = problemOf(error);
      // A connection that is down is the status's to tell. What the agent said is said on the screen.
      if ("said" in problem && sessionsOnShow()) set({ refusal: problem.said });
    },
  );

  /** The agent on the roster that is called `name`. */
  const roster = (name: string): AgentEntry => {
    const found = agentEntries(model).find((entry) => entry.name === name);
    if (found === undefined) throw new Error(`${name} is not on the roster.`);
    return found;
  };

  /**
   * The channel a new thread goes in: the person's DM with the agent, which is
   * made if they have none, or the room, which the console never makes.
   */
  async function channelOf(client: ChatClient, place: Place, signal: AbortSignal): Promise<Channel> {
    if (place.kind === "room") {
      const room = model.rooms[place.id];
      if (room === undefined) throw new Error("You are not in that room.");
      return room.channel;
    }
    return model.dms[place.name]?.channel ?? (await client.openDm(roster(place.name).id, signal));
  }

  /** With one agent and no room to choose from, the person is taken to the agent, once. */
  function land(): void {
    if (landed || !channelsRead) return;
    const agents: AgentEntry[] = agentEntries(model);
    if (agents.length === 0) return;
    landed = true;
    const [only] = agents;
    if (only !== undefined && agents.length === 1 && Object.keys(model.rooms).length === 0 && model.where.screen === "agents") {
      select(only.name);
    }
  }

  registry.onChange(() => {
    set({ gateway: registry.status(), listing: registry.listing() });
    land();
    void refreshChannels();
  });
  chat.onStatus((status) => {
    set({ chat: status });
    if (status.state === "up") void refreshChannels();
  });
  const poll = setInterval(() => {
    void refreshChannels();
    void refreshSessions();
  }, pollMs);
  // The links have been trying since they were made, and may have something to say already.
  set({ gateway: registry.status(), listing: registry.listing(), chat: chat.status() });

  function select(name: string): void {
    landed = true;
    useAgent(name);
    chat.follow(undefined);
    agent?.watch(undefined);
    set({ where: { screen: "threads", place: { kind: "agent", name } }, thread: undefined, session: undefined, refusal: undefined, notice: undefined });
    void refreshChannels();
  }

  function selectRoom(id: string): void {
    landed = true;
    useAgent(undefined);
    chat.follow(undefined);
    set({ where: { screen: "threads", place: { kind: "room", id } }, thread: undefined, session: undefined, notice: undefined });
    void refreshChannels();
  }

  function open(threadId: string | undefined): void {
    const { where } = model;
    if (where.screen !== "threads" && where.screen !== "thread") return;
    landed = true;
    chat.follow(threadId);
    agent?.watch(threadId);
    set({ where: { screen: "thread", place: where.place, thread: threadId }, thread: undefined, session: undefined, notice: undefined });
  }

  // The thread a person started and could not send a first message in, so that trying again does not make another.
  let started: { place: string; threadId: string } | undefined;
  // The message being sent, so that sending the same again after a failure is the same message.
  let pending: { threadId: string; text: string; requestId: string } | undefined;
  // Which new thread is on screen, so that a first message that arrives late does not open it over something else.
  let newThreads = 0;

  return {
    model: () => model,
    subscribe: (listener) => listeners.add(listener),

    selectAgent: select,
    selectRoom,
    openThread: (threadId) => open(threadId),
    startThread() {
      newThreads += 1;
      started = undefined;
      open(undefined);
    },
    switchLists() {
      const { where } = model;
      if (where.screen === "threads" && where.place.kind === "agent") {
        set({ where: { screen: "sessions", agent: where.place.name }, notice: undefined, refusal: undefined });
        void refreshSessions();
      } else if (where.screen === "sessions") {
        set({ where: { screen: "threads", place: { kind: "agent", name: where.agent } }, notice: undefined, refusal: undefined });
        void refreshChannels();
      }
    },
    openSession(address) {
      const { where } = model;
      if (where.screen !== "sessions") return;
      agent?.watch(address);
      set({ where: { screen: "session", agent: where.agent, session: address }, session: undefined, notice: undefined, refusal: undefined });
    },
    back() {
      const { where } = model;
      if (where.screen === "thread") {
        chat.follow(undefined);
        agent?.watch(undefined);
        set({ where: { screen: "threads", place: where.place }, thread: undefined, session: undefined, notice: undefined });
        void refreshChannels();
      } else if (where.screen === "session") {
        agent?.watch(undefined);
        set({ where: { screen: "sessions", agent: where.agent }, session: undefined, notice: undefined, refusal: undefined });
        void refreshSessions();
      } else if (where.screen === "threads" || where.screen === "sessions") {
        useAgent(undefined);
        set({ where: { screen: "agents" }, notice: undefined, refusal: undefined });
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
          let id = where.thread ?? (started?.place === placeKey(where.place) ? started.threadId : undefined);
          if (id === undefined) {
            const channel = await channelOf(client, where.place, answered);
            id = (await client.createThread(channel.id, null, answered)).id;
            started = { place: placeKey(where.place), threadId: id };
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
        void refreshChannels();
        return { ok: true };
      } catch (error) {
        const silent = answered.aborted ? new Down({ kind: "unreachable", message: "the chat server did not answer" }) : error;
        say({ kind: "not-sent", problem: problemOf(silent) });
        return { ok: false };
      }
    },

    async stop() {
      if (agent === undefined || !workingInOpenThread(model)) return;
      try {
        if (await agent.stop()) say({ kind: "stopped" });
      } catch (error) {
        say({ kind: "not-stopped", problem: problemOf(error) });
      }
    },

    async farewell() {
      const waiting = new AbortController();
      await Promise.race([refreshChannels(), delay(FAREWELL_MS, undefined, { signal: waiting.signal }).catch(() => undefined)]);
      waiting.abort();
      const { where } = model;
      const entries = agentEntries(model);
      // Only the person's threads with an agent are looked at: a room has no one agent's work to stop with a key.
      const shown = agentLookedAt(where);
      const names = [...(shown === undefined ? [] : [shown]), ...entries.map((entry) => entry.name)];
      for (const name of new Set(names)) {
        // The thread on screen comes first, then the newest thread the agent is working in.
        const id = entries.find((entry) => entry.name === name)?.id;
        if (id === undefined) continue;
        // A session that was working when the agent went away is not working now, whatever its last view says.
        const sessionWorking = model.session?.status.busy === true && model.agent?.state !== "down";
        const onScreen =
          where.screen === "thread" && shown === name && where.thread !== undefined
            ? { thread: where.thread, working: sessionWorking || model.thread?.thread.working.some((mark) => mark.memberId === id) === true }
            : undefined;
        if (onScreen?.working === true) return { agent: name, thread: onScreen.thread };
        const working = model.dms[name]?.threads.find((thread) => workingIn(thread, id));
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
