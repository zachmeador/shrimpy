import { valueOf } from "../../contracts/gateway/index.ts";
import { Down, problemOf } from "../network/index.ts";
import type { Holdings } from "./holdings.ts";
import { type AgentEntry, agentEntries, type Model, type Place, placeKey } from "./model.ts";
import type { Moves } from "./moves.ts";
import type { Store } from "./store.ts";

/** Starting a thread, and saying something in the open thread or in a new one. */
export interface Sending {
  /** Start a thread in `place`, or with the agent or in the room whose list is open. It comes to be with its first message. */
  startThread(place: Place | undefined): void;
  /** Say something in the open thread, or in a new one, and say whether it was sent. The person's draft is theirs to put back when it was not. */
  send(text: string): Promise<boolean>;
}

/** The agent on the roster with member ID `id`. */
function rosterAgent(model: Model, id: string): AgentEntry {
  const found = agentEntries(model).find((entry) => entry.id === id);
  if (found === undefined) throw new Error(`${id} is not on the roster.`);
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
  // Which new thread is open, so that a first message that arrives late does not open it over something else.
  let newThreads = 0;

  /**
   * The ID of the channel a new thread goes in: the person's DM with the agent,
   * which is made if they have none, or the room, which a client never makes.
   */
  async function channelOf(place: Exclude<Place, { kind: "read-only" }>, signal: AbortSignal): Promise<string> {
    const model = store.model();
    if (place.kind === "room") {
      if (model.rooms[place.id] === undefined) throw new Error("You are not in that room.");
      return place.id;
    }
    const dm = model.dms[place.id];
    if (dm !== undefined) return dm.channel.id;
    return valueOf(await held.chat.calls.openDm(rosterAgent(model, place.id).id, signal)).id;
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
    startThread(place) {
      newThreads += 1;
      started = undefined;
      moves.start(place);
    },
    async send(text) {
      const { item } = store.model().open;
      if (item?.kind !== "thread") return false;
      const { place } = item;
      // The chat server refuses a write in a channel the person only reads, so nothing is asked of it.
      if (place.kind === "read-only") return false;
      const newThread = newThreads;
      // A chat server that has stopped answering must not leave the message in limbo. Sending it again is safe either way.
      const answered = AbortSignal.timeout(sendMs);
      try {
        const { chat } = store.model();
        if (chat.state === "down") throw new Down(chat.why);
        const threadId = await threadIn(place, item.thread, answered);
        const requestId = pending?.threadId === threadId && pending.text === text ? pending.requestId : crypto.randomUUID();
        pending = { threadId, text, requestId };
        await held.onThread(threadId, async (thread) => valueOf(await thread.calls.post(text, requestId, answered)));
        pending = undefined;
        // A message that is sent ends what `/status` read.
        store.endStatus();
        if (item.thread === undefined) {
          started = undefined;
          if (newThreads === newThread) moves.started(threadId);
        }
        return true;
      } catch (error) {
        const silent = answered.aborted ? new Down({ kind: "unreachable", message: "the chat server did not answer" }) : error;
        store.say({ kind: "not-sent", problem: problemOf(silent) });
        return false;
      }
    },
  };
}
