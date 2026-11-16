import { randomUUID } from "node:crypto";
import { valueOf } from "../../../contracts/gateway/index.ts";
import { Down, problemOf } from "../network/index.ts";
import type { Holdings } from "./holdings.ts";
import { type AgentEntry, agentEntries, type Model, type Place, type SendResult } from "./model.ts";
import type { Moves } from "./moves.ts";
import type { Store } from "./store.ts";

/** Starting a thread, and saying something in the open thread or in a new one. */
export interface Sending {
  /** Start a thread with the selected agent or in the selected room. It comes to be with its first message. */
  startThread(): void;
  /** Say something in the open thread, or in a new one. The person's draft is theirs to put back when it fails. */
  send(text: string): Promise<SendResult>;
}

/** A place as a string, for telling one from another. */
const placeKey = (place: Place): string => (place.kind === "agent" ? `agent ${place.name}` : `${place.kind} ${place.id}`);

/** The agent on the roster that is called `name`. */
function rosterAgent(model: Model, name: string): AgentEntry {
  const found = agentEntries(model).find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`${name} is not on the roster.`);
  return found;
}

/**
 * Sending, which waits `sendMs` for the chat server before it says a message
 * was not sent. Sending the same again after a failure is the same message, in
 * the same new thread, so that nothing is posted twice.
 */
export function createSending(store: Store, held: Holdings, moves: Moves, sendMs: number): Sending {
  // The thread a person started and could not send a first message in, so that trying again does not make another.
  let started: { place: string; threadId: string } | undefined;
  // The message being sent, so that sending the same again after a failure is the same message.
  let pending: { threadId: string; text: string; requestId: string } | undefined;
  // Which new thread is on screen, so that a first message that arrives late does not open it over something else.
  let newThreads = 0;

  /**
   * The ID of the channel a new thread goes in: the person's DM with the agent,
   * which is made if they have none, or the room, which the console never makes.
   */
  async function channelOf(place: Exclude<Place, { kind: "read-only" }>, signal: AbortSignal): Promise<string> {
    const model = store.model();
    if (place.kind === "room") {
      if (model.rooms[place.id] === undefined) throw new Error("You are not in that room.");
      return place.id;
    }
    const dm = model.dms[place.name];
    if (dm !== undefined) return dm.channel.id;
    return valueOf(await held.chat.calls.openDm(rosterAgent(model, place.name).id, signal)).id;
  }

  /** The thread a message in `place` goes in: the open one, the new one it was tried in before, or one made now. */
  async function threadIn(place: Exclude<Place, { kind: "read-only" }>, open: string | undefined, signal: AbortSignal): Promise<string> {
    const threadId = open ?? (started?.place === placeKey(place) ? started.threadId : undefined);
    if (threadId !== undefined) return threadId;
    const channelId = await channelOf(place, signal);
    const made = await held.onChannel(channelId, async (channel) => valueOf(await channel.calls.createThread(null, signal)).id);
    started = { place: placeKey(place), threadId: made };
    return made;
  }

  return {
    startThread() {
      newThreads += 1;
      started = undefined;
      moves.open(undefined);
    },
    async send(text) {
      const { where } = store.model();
      // The chat server refuses a write in a channel the person only reads, so nothing is asked of it.
      if (where.screen !== "thread" || where.place.kind === "read-only") return { ok: false };
      const newThread = newThreads;
      // A chat server that has stopped answering must not leave the message in limbo. Sending it again is safe either way.
      const answered = AbortSignal.timeout(sendMs);
      try {
        const { chat } = store.model();
        if (chat.state === "down") throw new Down(chat.why);
        const threadId = await threadIn(where.place, where.thread, answered);
        const requestId = pending?.threadId === threadId && pending.text === text ? pending.requestId : randomUUID();
        pending = { threadId, text, requestId };
        await held.onThread(threadId, async (thread) => valueOf(await thread.calls.post(text, requestId, answered)));
        pending = undefined;
        // A message that is sent ends what `/status` read.
        store.endStatus();
        if (where.thread === undefined) {
          started = undefined;
          const now = store.model().where;
          if (now.screen === "thread" && now.thread === undefined && newThreads === newThread) moves.open(threadId);
        }
        return { ok: true };
      } catch (error) {
        const silent = answered.aborted ? new Down({ kind: "unreachable", message: "the chat server did not answer" }) : error;
        store.say({ kind: "not-sent", problem: problemOf(silent) });
        return { ok: false };
      }
    },
  };
}
