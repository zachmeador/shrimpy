import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  CompactionEntry,
  type ConversationView,
  type EntryRecord,
  type InboxState,
  type LiveState,
  type ModelRef,
  ResetEntry,
  type ToolDiagnostic,
  ToolResultEntry,
  type UsageState,
  UserEntry,
} from "@earendil-works/pi-durable";
import type {
  QueuedInput,
  SessionActivity,
  SessionImage,
  SessionItem,
  SessionPage,
  SessionStatus,
  WaitingWakeup,
} from "../../contracts/agent/index.ts";
import { assistantText, failureOf } from "../turns/durable.ts";

type AnswerItem = Extract<SessionItem, { type: "assistant" }>;
type ToolItem = Extract<SessionItem, { type: "tool" }>;
type Content = string | readonly { type: string; text?: string; mimeType?: string }[];

/**
 * The newest stretch of a session, as clients see it, from the engine's view of
 * it: the items of the entries in the view's window, a partial answer and its
 * tool calls as they arrive, and the entry just before the window. A tool call
 * is an item of the answer that made it, so the result of one whose answer is
 * before the window is not shown here: it comes with that answer when a client
 * pages back.
 */
export function windowOf(view: ConversationView): SessionPage {
  const live = (view.docs["pi.live"] ?? {}) as LiveState;
  const items = toItems(view.entries, live);
  const partial = live.generation?.message as AssistantMessage | undefined;
  if (partial !== undefined) {
    items.push(assistantItem(partial, null, true));
    const shown = new Set(items.flatMap((item) => (item.type === "tool" ? [item.id] : [])));
    for (const tool of toolItems(partial, null, live)) {
      if (!shown.has(tool.id)) items.push(tool);
    }
  }
  return { items, before: view.before ?? null };
}

/**
 * A stretch of a session's history that a client pages back to: the items of
 * `entries`, oldest first, the entry just before them, or null at the session's
 * start, and `later`, the entries that follow them, where the results of their
 * last tool calls are.
 */
export function pageOf(entries: readonly EntryRecord[], before: number | null, later: readonly EntryRecord[]): SessionPage {
  const items = toItems(entries, {});
  const open = new Map(items.flatMap((item) => (item.type === "tool" && item.status === "pending" ? [[item.id, item] as const] : [])));
  for (const entry of later) {
    const result = ToolResultEntry.is(entry) ? (entry.model?.[0] as ToolResultMessage | undefined) : undefined;
    const tool = result === undefined ? undefined : open.get(result.toolCallId);
    if (tool !== undefined && result !== undefined) finishTool(tool, entry, result);
  }
  return { items, before };
}

/** How many tool calls of `entries` have no result among them, which a page looks for after them. */
export function unfinishedCalls(entries: readonly EntryRecord[]): number {
  return toItems(entries, {}).filter((item) => item.type === "tool" && item.status === "pending").length;
}

function toItems(entries: readonly EntryRecord[], live: LiveState): SessionItem[] {
  const items: SessionItem[] = [];
  const tools = new Map<string, ToolItem>();
  for (const entry of entries) {
    const message = entry.model?.[0];
    if (UserEntry.is(entry) && message?.role === "user") {
      items.push({ type: "user", entry: entry.id, text: textOf(message.content), images: imagesOf(message.content) });
    } else if (AssistantEntry.is(entry) && message?.role === "assistant") {
      items.push(assistantItem(message, entry.id, false));
      for (const tool of toolItems(message, entry.id, live)) {
        // Only an answer that stopped to use tools runs its calls.
        if (message.stopReason !== "toolUse") {
          tool.status = "error";
          tool.output = "Not run: the answer was interrupted.";
        }
        tools.set(tool.id, tool);
        items.push(tool);
      }
    } else if (ToolResultEntry.is(entry) && message?.role === "toolResult") {
      const tool = tools.get(message.toolCallId);
      if (tool !== undefined) finishTool(tool, entry, message);
    } else if (ResetEntry.is(entry)) {
      items.push({ type: "marker", entry: entry.id, marker: "reset" });
    } else if (CompactionEntry.is(entry)) {
      items.push({ type: "marker", entry: entry.id, marker: "compaction" });
    }
  }
  return items;
}

function assistantItem(message: AssistantMessage, entry: number | null, streaming: boolean): AnswerItem {
  let thinking = "";
  for (const block of message.content) {
    if (block.type === "thinking") thinking += block.thinking;
  }
  return { type: "assistant", entry, text: assistantText(message), thinking, streaming, ended: streaming ? null : endingOf(message) };
}

/**
 * How a stored answer ended, from the engine's stop reason, with what the
 * engine said about it. A stop reason the agent has no word for is `other`,
 * with the engine's own word, so no client sees it as a value.
 */
function endingOf(message: AssistantMessage): AnswerItem["ended"] {
  const said = message.errorMessage ?? null;
  switch (message.stopReason) {
    case "stop":
      return { how: "finished", detail: said };
    case "toolUse":
      return { how: "called_tools", detail: said };
    case "length":
      return { how: "too_long", detail: said };
    case "error":
      return { how: "failed", detail: said };
    case "aborted":
      return { how: "interrupted", detail: said };
    default:
      return { how: "other", detail: said === null ? message.stopReason : `${message.stopReason}: ${said}` };
  }
}

function toolItems(message: AssistantMessage, entry: number | null, live: LiveState): ToolItem[] {
  const items: ToolItem[] = [];
  for (const block of message.content) {
    if (block.type !== "toolCall") continue;
    const slot = live.tools?.find((candidate) => candidate.callId === block.id);
    items.push({
      type: "tool",
      entry,
      id: block.id,
      name: block.name,
      args: JSON.stringify(block.arguments),
      status: slot?.status === "running" ? "running" : "pending",
      output: slot?.output ?? "",
      images: [],
      notes: [],
    });
  }
  return items;
}

/**
 * A result entry stores the text the model saw, which ends with a rendered
 * <harness> block, and the same facts as structured diagnostics. The view
 * uses the structured form: `interrupted` marks a call recovery did not rerun.
 */
function finishTool(tool: ToolItem, entry: EntryRecord, result: ToolResultMessage): void {
  const data = entry.data as { diagnostics?: ToolDiagnostic[] } | undefined;
  const diagnostics = data?.diagnostics ?? [];
  tool.output = textOf(result.content).replace(/\n?<harness>[\s\S]*<\/harness>\s*$/, "");
  tool.images = imagesOf(result.content);
  tool.notes = diagnostics.map((diagnostic) => diagnostic.message);
  if (!result.isError) tool.status = "done";
  else if (diagnostics.some((diagnostic) => diagnostic.code === "interrupted")) {
    tool.status = "interrupted";
  } else tool.status = "error";
}

/**
 * What a session is doing, from the engine's view of it, and the wake-ups it is
 * waiting on. `home` is the model the agent's home names now: the status says
 * whether the session's model is that one or its own. Why the last turn ended
 * without an answer is the engine's reason in the contract's words, until the
 * next turn starts.
 */
export function statusOf(view: ConversationView, home: ModelRef, wakeups: readonly WaitingWakeup[]): SessionStatus {
  const live = (view.docs["pi.live"] ?? {}) as LiveState;
  const inbox = (view.docs["pi.inbox"] ?? { items: [] }) as InboxState;
  const agent = (view.docs["pi.agent"] ?? {}) as { model?: { provider: string; modelId: string } };
  const spend = (view.docs["pi.usage"] ?? { models: {}, tools: {} }) as UsageState;
  const usage = { input: 0, output: 0, cost: 0 };
  for (const used of Object.values(spend.models)) {
    usage.input += used.input;
    usage.output += used.output;
    usage.cost += used.cost.total;
  }
  return {
    activity: toActivity(live),
    busy: live.run !== undefined,
    queued: inbox.items.map(toQueued),
    model: agent.model ? { provider: agent.model.provider, id: agent.model.modelId } : null,
    ownModel: agent.model !== undefined && (agent.model.provider !== home.provider || agent.model.modelId !== home.modelId),
    usage,
    wakeups: wakeups.map(({ due, note }) => ({ due, note })),
    failure: live.runFailure === undefined ? null : failureOf(live.runFailure),
  };
}

function toActivity(live: LiveState): SessionActivity {
  if (live.generation?.retry !== undefined) {
    return { kind: "retrying", error: live.generation.retry.error };
  }
  const running = live.tools?.find((slot) => slot.status === "running");
  if (running !== undefined) return { kind: "tool", name: running.name };
  if (live.generation !== undefined) return { kind: "answering" };
  if (live.run !== undefined) return { kind: "working" };
  return { kind: "idle" };
}

/**
 * Input that waits, and when the engine will take it: an input that steers at
 * the running turn's next step, one that follows up after it, and anything
 * else, such as an entry the engine writes, which the agent makes none of and
 * names by its kind, as the engine does.
 */
function toQueued(item: InboxState["items"][number]): QueuedInput {
  switch (item.mode) {
    case "steer":
      return { when: "next_step", text: inputText(item.content as Message["content"]) };
    case "followUp":
      return { when: "next_turn", text: inputText(item.content as Message["content"]) };
    default: {
      const kind = item.entry.kind;
      return { when: "other", text: typeof kind === "string" ? kind : "entry" };
    }
  }
}

/** The words of an input, with a mark for each image. */
const inputText = (content: Message["content"]): string =>
  typeof content === "string" ? content : content.map((block) => (block.type === "text" ? block.text : "[image]")).join("");

/** The text of a message's content, without its images, which `imagesOf` names. */
function textOf(content: Content): string {
  if (typeof content === "string") return content;
  return content.map((block) => (block.type === "text" ? (block.text ?? "") : "")).join("");
}

/** The images in a message's content, by their media types, in order. */
function imagesOf(content: Content): SessionImage[] {
  if (typeof content === "string") return [];
  return content.flatMap((block) => (block.type === "image" ? [{ mimeType: block.mimeType ?? "image" }] : []));
}
