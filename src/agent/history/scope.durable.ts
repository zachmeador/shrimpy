import type { Context } from "@earendil-works/chord/context";
import type { ToolExecutionApi } from "@earendil-works/pi-durable";
import { type ChatToolsOptions, resolveChannel, resolveThread } from "../chat-tools/durable.ts";
import { callSignal, type LiveChat } from "../links/index.ts";
import { isThreadId } from "./refs.ts";

/** Where a `history({ action: "search" })` call looks. */
export type SearchScope =
  | { kind: "all"; label: string }
  | { kind: "thread"; threadId: string; channelId?: string; label: string }
  | { kind: "channel"; channelId: string; label: string }
  | { problem: string };

/** Which thread a `history({ action: "read" })` call inspects. */
export type ReadTarget =
  | { threadId: string; label?: string }
  | { problem: string };

type CurrentThread = { threadId: string; channelId: string } | undefined;

/** Bind shared tool context once so channel/thread lookups stay concise. */
function makeResolver(live: LiveChat, options: ChatToolsOptions, api: ToolExecutionApi, context: Context) {
  const shared = {
    includeReadOnly: true,
    conversationId: api.conversationId,
    read: api,
    chat: live.chat,
    self: live.self,
    roster: options.roster(),
    context,
    signal: callSignal(live, context),
  };
  return {
    thread: (value: string) => resolveThread({ ...shared, argument: "in", value, allowNewDm: false }),
    channel: (value: string) => resolveChannel({ ...shared, value, openDmIfMissing: false }),
  };
}

/** Resolve the `in` / `all` scope of `history({ action: "search" })`. */
export async function resolveSearchScope(
  rawIn: string | undefined,
  all: boolean,
  current: CurrentThread,
  live: LiveChat | undefined,
  options: ChatToolsOptions,
  api: ToolExecutionApi,
  context: Context,
): Promise<SearchScope> {
  if (all) return { kind: "all", label: "all readable channels and sessions" };
  const written = rawIn?.trim() ?? "";
  if (written === "") {
    if (current === undefined) {
      return { problem: 'This session has no thread. Pass `all: true` or `in` with a thread ID, "@name", or "#room".' };
    }
    return { kind: "thread", threadId: current.threadId, channelId: current.channelId, label: "this thread" };
  }
  if (isThreadId(written)) {
    if (live === undefined) return { kind: "thread", threadId: written, label: written };
    const resolved = await makeResolver(live, options, api, context).thread(written);
    return "problem" in resolved
      ? resolved
      : { kind: "thread", threadId: resolved.threadId, channelId: resolved.channelId, label: resolved.label };
  }
  if (live === undefined) {
    return {
      problem:
        "Chat is not reachable right now, so named rooms and DMs can't be resolved. Omit `in` to search this thread, or pass a thread ID.",
    };
  }
  const resolve = makeResolver(live, options, api, context);
  // `#room` (matching a room name directly) and `@name` (no `/`) search the whole channel; `#room/<thread>` and `@name/<thread>` search one thread.
  if (written.startsWith("#")) {
    const asChannel = await resolve.channel(written);
    if (!("problem" in asChannel)) return { kind: "channel", channelId: asChannel.channel.id, label: asChannel.label };
    if (!written.includes("/")) return asChannel;
    const asThread = await resolve.thread(written);
    return "problem" in asThread
      ? asThread
      : { kind: "thread", threadId: asThread.threadId, channelId: asThread.channelId, label: asThread.label };
  }
  if (written.startsWith("@") && written.length > 1) {
    if (!written.includes("/")) {
      const asChannel = await resolve.channel(written);
      return "problem" in asChannel
        ? asChannel
        : { kind: "channel", channelId: asChannel.channel.id, label: asChannel.label };
    }
    const asThread = await resolve.thread(written);
    return "problem" in asThread
      ? asThread
      : { kind: "thread", threadId: asThread.threadId, channelId: asThread.channelId, label: asThread.label };
  }
  return { problem: 'in must be a thread ID (th_...), "@name", "@name/<thread>", "#room", or "#room/<thread>".' };
}

/** Resolve the target thread of `history({ action: "read" })` from ref, `in`, or current thread. */
export async function resolveReadTarget(
  explicitThread: string | undefined,
  rawIn: string | undefined,
  current: CurrentThread,
  live: LiveChat | undefined,
  options: ChatToolsOptions,
  api: ToolExecutionApi,
  context: Context,
): Promise<ReadTarget> {
  if (explicitThread !== undefined) return { threadId: explicitThread };
  const written = rawIn?.trim() ?? "";
  if (written !== "") {
    if (isThreadId(written)) return { threadId: written };
    if (live === undefined) {
      return { problem: "Chat is not reachable right now. Pass a bare thread ID (th_...) or try again later." };
    }
    const resolved = await makeResolver(live, options, api, context).thread(written);
    return "problem" in resolved ? resolved : { threadId: resolved.threadId, label: resolved.label };
  }
  if (current !== undefined) return { threadId: current.threadId, label: "this thread" };
  return { problem: "This session has no thread. Pass `ref` or `in` with a thread ID." };
}
