import type { Channel, Thread } from "../../contracts/chat/index.ts";
import { isLost } from "../../contracts/gateway/index.ts";
import type { Place } from "../inputs/index.ts";
import { type ChatCalls, type LiveChat } from "../links/index.ts";
import { describePlace } from "./place.ts";

/** Where a thread is, among the channels whoever asks is in. */
type ThreadPlace =
  | { kind: "found"; channelId: string; channel: Channel; thread: Thread }
  /** None of those channels has it: there is no such thread, or the asker is not in its channel. Chat does not tell the two apart. */
  | { kind: "missing" }
  /** Chat was lost while asking. */
  | { kind: "unreachable" };

/**
 * Ask chat which channel a thread is in: the channels the member `chat` speaks
 * for is in, and the threads of each. A thread in a channel the member is not in
 * looks like a thread that is not there.
 */
async function placeOfThread(chat: ChatCalls, threadId: string, signal: AbortSignal): Promise<ThreadPlace> {
  try {
    for (const channel of chat.channels()) {
      const found = (await chat.threads(channel.id, signal)).find((thread) => thread.id === threadId);
      if (found !== undefined) return { kind: "found", channelId: found.channelId, channel, thread: found };
    }
    return { kind: "missing" };
  } catch (error) {
    if (isLost(error)) return { kind: "unreachable" };
    throw error;
  }
}

/** The longest the agent waits for chat to come up and say where a thread is. */
const LONGEST_WAIT_MS = 15_000;

/**
 * The channel of a thread for an occurrence of a trigger, and where the thread is,
 * asked of chat once `untilChat` has it up, or the reason there is none in words
 * for whoever reads the occurrence's record: chat is away, or the agent is not in
 * the thread's channel. The wait for chat to come up counts in the longest wait,
 * so an occurrence that falls due as the agent starts runs once chat links.
 * Chat being away is no failure of its own to report, and aborting `signal`
 * gives up.
 */
export async function channelOfThread(
  untilChat: (signal: AbortSignal) => Promise<LiveChat>,
  threadId: string,
  signal: AbortSignal,
): Promise<{ channelId: string; place?: Place } | { problem: string }> {
  const patience = AbortSignal.timeout(LONGEST_WAIT_MS);
  let live: LiveChat;
  try {
    live = await untilChat(AbortSignal.any([signal, patience]));
  } catch (error) {
    if (signal.aborted || !patience.aborted) throw error;
    return { problem: chatAway(threadId) };
  }
  try {
    const place = await placeOfThread(live.chat, threadId, AbortSignal.any([signal, live.lost, patience]));
    if (place.kind === "found") {
      const where = describePlace(live.self, place.channel, place.thread);
      return { channelId: place.channelId, ...(where === undefined ? {} : { place: where }) };
    }
    return { problem: place.kind === "missing" ? notInAChannel(threadId) : chatAway(threadId) };
  } catch (error) {
    if (signal.aborted) throw error;
    if (live.lost.aborted || patience.aborted) return { problem: chatAway(threadId) };
    throw error;
  }
}

const chatAway = (threadId: string): string =>
  `Chat is not reachable right now, so the agent could not look for thread ${threadId} to make its session there. ` +
  "The trigger tries again at its next occurrence.";

const notInAChannel = (threadId: string): string =>
  `The agent is in no channel that has the thread ${threadId}: there is no such thread, or the agent is not in its channel. ` +
  "Give the trigger a thread the agent is in.";
