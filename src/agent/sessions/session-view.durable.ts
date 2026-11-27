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
  OnceTrigger,
  ProcessSummary,
  QueuedInput,
  SessionActivity,
  SessionImage,
  SessionItem,
  SessionPage,
  SessionStatus,
  WatchSummary,
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
/** Whether a model, by its provider and ID, takes pictures. */
export type TakesPictures = (provider: string, model: string) => boolean;

export function windowOf(view: ConversationView, takesPictures: TakesPictures): SessionPage {
  const live = (view.docs["pi.live"] ?? {}) as LiveState;
  const items = toItems(view.entries, live, takesPictures);
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
export function pageOf(entries: readonly EntryRecord[], before: number | null, later: readonly EntryRecord[], takesPictures: TakesPictures): SessionPage {
  const items = toItems(entries, {}, takesPictures);
  const open = new Map(items.flatMap((item) => (item.type === "tool" && item.status === "pending" ? [[item.id, item] as const] : [])));
  const blind = blindAfter([...entries, ...later], takesPictures);
  for (const entry of later) {
    const result = ToolResultEntry.is(entry) ? (entry.model?.[0] as ToolResultMessage | undefined) : undefined;
    const tool = result === undefined ? undefined : open.get(result.toolCallId);
    if (tool !== undefined && result !== undefined) finishTool(tool, entry, result, blind.has(entry.id));
  }
  return { items, before };
}

/** How many tool calls of `entries` have no result among them, which a page looks for after them. */
export function unfinishedCalls(entries: readonly EntryRecord[]): number {
  return toItems(entries, {}, () => true).filter((item) => item.type === "tool" && item.status === "pending").length;
}

/**
 * The entries among `entries` whose images the model that answered after them
 * was shown Pi's line in place of, since it takes no pictures. An entry with no
 * answer after it yet is not among them.
 */
function blindAfter(entries: readonly EntryRecord[], takesPictures: TakesPictures): Set<number> {
  const blind = new Set<number>();
  let answeredBy: AssistantMessage | undefined;
  for (const entry of entries.toReversed()) {
    const message = entry.model?.[0];
    if (AssistantEntry.is(entry) && message?.role === "assistant") answeredBy = message;
    else if (answeredBy !== undefined && !takesPictures(answeredBy.provider, answeredBy.model)) blind.add(entry.id);
  }
  return blind;
}

function toItems(entries: readonly EntryRecord[], live: LiveState, takesPictures: TakesPictures): SessionItem[] {
  const items: SessionItem[] = [];
  const tools = new Map<string, ToolItem>();
  const blind = blindAfter(entries, takesPictures);
  for (const entry of entries) {
    const message = entry.model?.[0];
    if (UserEntry.is(entry) && message?.role === "user") {
      const images = imagesOf(message.content, entry.id, blind.has(entry.id));
      items.push({ type: "user", entry: entry.id, at: message.timestamp, text: wordsOf(message.content), images });
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
      if (tool !== undefined) finishTool(tool, entry, message, blind.has(entry.id));
    } else if (ResetEntry.is(entry)) {
      items.push({ type: "marker", entry: entry.id, at: message?.timestamp ?? null, marker: "reset" });
    } else if (CompactionEntry.is(entry)) {
      items.push({ type: "marker", entry: entry.id, at: message?.timestamp ?? null, marker: "compaction" });
    }
  }
  return items;
}

function assistantItem(message: AssistantMessage, entry: number | null, streaming: boolean): AnswerItem {
  let thinking = "";
  for (const block of message.content) {
    if (block.type === "thinking") thinking += block.thinking;
  }
  return {
    type: "assistant",
    entry,
    at: message.timestamp,
    text: assistantText(message),
    thinking,
    streaming,
    ended: streaming ? null : endingOf(message),
  };
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
      at: message.timestamp,
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
function finishTool(tool: ToolItem, entry: EntryRecord, result: ToolResultMessage, omitted: boolean): void {
  const data = entry.data as { diagnostics?: ToolDiagnostic[] } | undefined;
  const diagnostics = data?.diagnostics ?? [];
  tool.output = textOf(result.content).replace(/\n?<harness>[\s\S]*<\/harness>\s*$/, "");
  tool.images = imagesOf(result.content, entry.id, omitted);
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
/** Per-thread background work shown on a session's status. */
export interface SessionExtras {
  processes: readonly ProcessSummary[];
  watches: readonly WatchSummary[];
  onceTriggers: readonly OnceTrigger[];
}

export function statusOf(view: ConversationView, home: ModelRef, extras: SessionExtras): SessionStatus {
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
    processes: [...extras.processes],
    watches: [...extras.watches],
    onceTriggers: [...extras.onceTriggers],
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

/** The words of what a session was shown, each block of them apart from the next, as a picture stood between them. */
function wordsOf(content: Content): string {
  if (typeof content === "string") return content;
  return content.flatMap((block) => (block.type === "text" ? [block.text ?? ""] : [])).join("\n\n");
}

/** The images in the content of the entry `entry`, by their media types, in order, with where each is kept. */
function imagesOf(content: Content, entry: number, omitted: boolean): SessionImage[] {
  if (typeof content === "string") return [];
  return content
    .filter((block) => block.type === "image")
    .map((block, index) => ({ mimeType: block.mimeType ?? "image", entry, index, omitted }));
}
