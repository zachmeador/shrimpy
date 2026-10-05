import type { ChatClient } from "../../contracts/chat/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import type { LiveChat } from "../links/index.ts";

/** Where a thread is, among the channels whoever asks is in. */
export type ThreadPlace =
  | { kind: "found"; channelId: string }
  /** None of those channels has it: there is no such thread, or the asker is not in its channel. Chat does not tell the two apart. */
  | { kind: "missing" }
  /** The connection to chat dropped while asking. */
  | { kind: "unreachable" };

/**
 * Ask chat which channel a thread is in: the channels the member `chat` speaks
 * for is in, and the threads of each. A thread in a channel the member is not in
 * looks like a thread that is not there. This is the one way the agent, and a
 * command that checks a thread for an agent, finds a thread's channel.
 */
export async function placeOfThread(chat: ChatClient, threadId: string, signal?: AbortSignal): Promise<ThreadPlace> {
  try {
    for (const channel of await chat.channels(signal)) {
      const found = (await chat.threads(channel.id, signal)).find((thread) => thread.id === threadId);
      if (found !== undefined) return { kind: "found", channelId: found.channelId };
    }
    return { kind: "missing" };
  } catch (error) {
    if (isDisconnected(error)) return { kind: "unreachable" };
    throw error;
  }
}

/** The longest the agent waits for chat to say where a thread is. */
const LONGEST_WAIT_MS = 15_000;

/**
 * The channel of a thread for an occurrence of a trigger, asked of the chat
 * link the agent has now, or the reason there is none in words for whoever reads
 * the occurrence's record: chat is away, or the agent is not in the thread's
 * channel. Chat being away is no failure of its own to report, and aborting
 * `signal` gives up.
 */
export async function channelOfThread(
  link: () => LiveChat | undefined,
  threadId: string,
  signal: AbortSignal,
): Promise<{ channelId: string } | { problem: string }> {
  const live = link();
  if (live === undefined) return { problem: chatAway(threadId) };
  const patience = AbortSignal.timeout(LONGEST_WAIT_MS);
  try {
    const place = await placeOfThread(live.chat, threadId, AbortSignal.any([signal, live.lost, patience]));
    if (place.kind === "found") return { channelId: place.channelId };
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
