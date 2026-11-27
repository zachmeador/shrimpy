import { type Channel, type Member, type Message, ONLY_MEMBERS, type Thread } from "../../contracts/chat/index.ts";
import { type Answer, refused, type Refused } from "../../contracts/gateway/index.ts";
import { fitAnswer } from "../input/index.ts";
import { isMember, readableChannel, readableThread, readsOthers } from "./access.ts";
import { answer } from "./answer.ts";
import type { ChatDeps } from "./deps.ts";
import { toChannel } from "./directory.ts";
import { keepsMarks } from "./marks.ts";
import { withWorking } from "./working.ts";

/** Messages a thread shows at once. Older ones are counted in `earlier` and read with `read`. */
const VIEW_MESSAGES = 200;

/** What a program that is no member is told when it asks chat for anything. */
export const NOT_A_MEMBER = refused(ONLY_MEMBERS);

/** What `Chat` shows its caller. */
export type ChatView = {
  you: Member | null;
  channels: Channel[];
  readOnlyChannels: Channel[];
  head: number;
};

/**
 * `Chat` as `caller` sees it, or as a program that is no member does when it is
 * undefined. `since` is a position the caller's head is known to have reached,
 * so only what came after it is looked through.
 */
export function chatView(deps: ChatDeps, caller: Member | undefined, since: number): ChatView {
  if (caller === undefined) return { you: null, channels: [], readOnlyChannels: [], head: 0 };
  return deps.store.transaction((tx) => ({
    you: caller,
    channels: tx.channelsOf(caller.id).map((record) => toChannel(record, caller)),
    readOnlyChannels: readsOthers(deps, caller) ? tx.channelsWithout(caller.id).map((record) => toChannel(record, caller)) : [],
    head: tx.headOf(caller.id, since),
  }));
}

/** What `Channel` shows its caller. */
export type ChannelView = {
  refusal: Refused | null;
  channel: Channel | null;
  threads: Thread[];
  /** How many messages are new to the caller in each thread, by thread ID, or null when chat keeps it no read marks. */
  unread: Record<string, number> | null;
};

/** `Channel` for `channelId` as `caller` sees it: the channel, its threads and what is new to it there, or why it can't have them. */
export function channelView(deps: ChatDeps, caller: Member | undefined, channelId: string): ChannelView {
  const found: Answer<ChannelView> =
    caller === undefined
      ? NOT_A_MEMBER
      : answer(() =>
          deps.store.transaction((tx) => {
            const record = readableChannel(tx, deps, caller, channelId);
            return {
              refusal: null,
              channel: toChannel(record, caller),
              threads: tx.threadsIn(channelId).map((thread) => withWorking(thread, deps.working)),
              unread: keepsMarks(caller) ? tx.unreadInChannel(caller.id, channelId) : null,
            };
          }),
        );
  return found.kind === "done" ? found.value : { refusal: found, channel: null, threads: [], unread: null };
}

/** What `Thread` shows its caller. */
export type ThreadView = {
  refusal: Refused | null;
  thread: Thread | null;
  messages: Message[];
  earlier: number;
  readOnly: boolean;
  /** How many messages are new to the caller, or null when chat keeps it no read marks. */
  unread: number | null;
};

/**
 * `Thread` for `threadId` as `caller` sees it: the thread, its newest messages
 * and how many come before them, whether the caller only reads it, and how
 * many are new to it; or why it can't have them.
 */
export function threadView(deps: ChatDeps, caller: Member | undefined, threadId: string): ThreadView {
  const found: Answer<ThreadView> =
    caller === undefined
      ? NOT_A_MEMBER
      : answer(() =>
          deps.store.transaction((tx) => {
            const { thread, channel } = readableThread(tx, deps, caller, threadId);
            const messages = fitAnswer(tx.messagesIn(threadId, null, VIEW_MESSAGES), "newest");
            return {
              refusal: null,
              thread: withWorking(thread, deps.working),
              messages,
              earlier: tx.messageCount(threadId) - messages.length,
              readOnly: !isMember(channel, caller.id),
              unread: keepsMarks(caller) ? tx.unreadIn(caller.id, threadId) : null,
            };
          }),
        );
  return found.kind === "done" ? found.value : { refusal: found, thread: null, messages: [], earlier: 0, readOnly: false, unread: null };
}
