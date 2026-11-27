import { isDeepStrictEqual } from "node:util";
import { copyJson, type JsonValue } from "@earendil-works/chord/json";
import type { AssistantMessage, Message, SystemMessage, Tool, ToolResultMessage, Usage } from "@earendil-works/pi-ai";
import { calculateContextTokens, estimateMessageTokens } from "@earendil-works/pi-ai/utils/estimate";
import {
  AssistantEntry,
  CompactionEntry,
  type ContextView,
  type EntryRecord,
  ResetEntry,
  SystemEntry,
  type ToolDiagnostic,
  ToolResultEntry,
  UserEntry,
} from "@earendil-works/pi-durable";
import type {
  AnswerEnding,
  RequestContentBlock,
  RequestMessage,
  RequestOmission,
  RequestRawEntry,
  RequestTool,
  RequestUsage,
} from "../../contracts/agent/index.ts";
import type { StoredHookDelta } from "../records/durable.ts";

/** Compute the minimal delta between Pi's derived context messages and the post-hook messages sent to the model. */
export function diffHookMessages(base: readonly Message[], actual: readonly Message[]): StoredHookDelta | undefined {
  if (base.length !== actual.length) {
    return { kind: "full", messages: actual.map((message) => copyJson(message as unknown as JsonValue, { omitUndefinedProperties: true })) };
  }
  const entries: { index: number; message: JsonValue }[] = [];
  for (let index = 0; index < actual.length; index += 1) {
    const before = base[index];
    const after = actual[index];
    if (!isDeepStrictEqual(before, after)) {
      entries.push({ index, message: copyJson(after as unknown as JsonValue, { omitUndefinedProperties: true }) });
    }
  }
  return entries.length === 0 ? undefined : { kind: "replace", entries };
}

/** Apply stored `beforeRequest` hook deltas onto Pi's reconstructed `view.messages`. */
export function applyHookDeltas(
  base: readonly Message[],
  deltas: StoredHookDelta | undefined,
): { messages: Message[]; modifiedIndices: Set<number> } {
  const modifiedIndices = new Set<number>();
  if (deltas === undefined) return { messages: [...base], modifiedIndices };
  if (deltas.kind === "full") {
    const messages = deltas.messages as unknown as Message[];
    for (let index = 0; index < messages.length; index += 1) {
      if (!isDeepStrictEqual(base[index], messages[index])) modifiedIndices.add(index);
    }
    return { messages, modifiedIndices };
  }
  const messages = [...base];
  for (const { index, message } of deltas.entries) {
    if (index >= 0 && index < messages.length) {
      messages[index] = message as unknown as Message;
      modifiedIndices.add(index);
    }
  }
  return { messages, modifiedIndices };
}

/** Estimate context tokens the same way Pi's compaction threshold check does. */
export function estimateContext(view: ContextView, effectiveMessages: readonly Message[]): number {
  let measured: AssistantMessage | undefined;
  const after = view.head?.id ?? Number.NEGATIVE_INFINITY;
  for (let index = view.entries.length - 1; index >= 0 && measured === undefined; index -= 1) {
    const entry = view.entries[index]!;
    if (entry.id <= after) continue;
    const found = view.contributions[index]?.findLast(
      (message): message is AssistantMessage => message.role === "assistant" && calculateContextTokens(message.usage) > 0,
    );
    if (found !== undefined) measured = found;
  }
  const from = measured === undefined ? 0 : view.messages.lastIndexOf(measured) + 1;
  let tokens = measured === undefined ? 0 : calculateContextTokens(measured.usage);
  for (const message of effectiveMessages.slice(from)) tokens += estimateMessageTokens(message);
  return tokens;
}

/** Replay positional system messages in order to produce the active section text map. */
export function replaySectionMap(messages: readonly Message[]): Map<string, string> {
  const active = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "system" || message.sections === undefined) continue;
    for (const [key, value] of Object.entries(message.sections)) {
      if (value === null) active.delete(key);
      else active.set(key, value);
    }
  }
  return active;
}

/** Convert Pi's provider stop reason to Shrimpy's `AnswerEnding`. */
export function toAnswerEnding(stopReason: string): AnswerEnding {
  switch (stopReason) {
    case "stop":
      return "finished";
    case "toolUse":
      return "called_tools";
    case "length":
      return "too_long";
    case "error":
      return "failed";
    case "aborted":
      return "interrupted";
    default:
      return "other";
  }
}

/** Convert Pi's usage struct to Shrimpy's `RequestUsage`. */
export function toRequestUsage(usage: Usage | undefined): RequestUsage | null {
  if (usage === undefined) return null;
  return {
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: usage.cost.total,
  };
}

/** Convert one offered Pi tool declaration into Shrimpy's `RequestTool`. */
export function toRequestTool(tool: Tool, extensions: Readonly<Record<string, string>>): RequestTool {
  const extension = Object.hasOwn(extensions, tool.name) ? (extensions[tool.name] ?? null) : null;
  return {
    name: tool.name,
    description: tool.description,
    parameters: JSON.stringify(tool.parameters),
    extension,
  };
}

/** Convert one Pi `Message` into Shrimpy's contract shape, never leaking Pi's internal types or raw image blobs. */
export function toRequestMessage(message: Message, modifiedByHook: boolean): RequestMessage {
  switch (message.role) {
    case "system":
      return systemMessageOf(message, modifiedByHook);
    case "user":
      return {
        role: "user",
        timestamp: message.timestamp,
        blocks: blocksOf(message.content),
        modifiedByHook,
      };
    case "assistant":
      return {
        role: "assistant",
        timestamp: message.timestamp,
        blocks: blocksOf(message.content),
        model: `${message.provider}/${message.model}`,
        stopReason: message.stopReason,
        modifiedByHook,
      };
    case "toolResult": {
      const details = message.details as { reason?: unknown } | undefined;
      return {
        role: "toolResult",
        timestamp: message.timestamp,
        toolCallId: message.toolCallId,
        toolName: message.toolName,
        isError: message.isError,
        blocks: blocksOf(message.content),
        synthesized: details?.reason === "missing_result",
        modifiedByHook,
      };
    }
  }
}

function systemMessageOf(message: SystemMessage, modifiedByHook: boolean): Extract<RequestMessage, { role: "system" }> {
  const sections =
    message.sections === undefined
      ? []
      : Object.entries(message.sections).map(([key, value]) => ({ key, value }));
  const toolsAdded = (message.toolsAdded ?? []).map((tool) => tool.name);
  const toolsRemoved = (message.toolsRemoved ?? []).map((tool) => tool.name);
  const content = typeof message.content === "string" ? message.content : message.content.map((block) => block.text).join("");
  return {
    role: "system",
    timestamp: message.timestamp,
    content,
    sections,
    toolsAdded,
    toolsRemoved,
    modifiedByHook,
  };
}

function blocksOf(content: Message["content"]): RequestContentBlock[] {
  if (typeof content === "string") return [{ type: "text", text: content }];
  const blocks: RequestContentBlock[] = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        blocks.push({ type: "text", text: block.text });
        break;
      case "thinking":
        blocks.push({ type: "thinking", thinking: block.thinking });
        break;
      case "image":
        blocks.push({ type: "image", mimeType: block.mimeType });
        break;
      case "toolCall":
        blocks.push({ type: "toolCall", id: block.id, name: block.name, args: JSON.stringify(block.arguments) });
        break;
    }
  }
  return blocks;
}

/**
 * Inspect `view.entries` against `view.contributions` to produce `rawEntries`
 * and every transcript-level omission/exclusion (edits, excluded stop reasons,
 * tool-result truncation diagnostics, and synthesized missing tool results).
 */
export function buildRawEntriesAndOmissions(
  view: ContextView,
  effectiveMessages: readonly RequestMessage[],
): { rawEntries: RequestRawEntry[]; omissions: RequestOmission[] } {
  const editsByTarget = new Map<number, { action: "omit" | "replace"; byEntry: number }>();
  for (const entry of view.entries) {
    for (const edit of entry.edits ?? []) {
      editsByTarget.set(edit.target, { action: edit.action, byEntry: entry.id });
    }
  }

  const rawEntries: RequestRawEntry[] = [];
  const omissions: RequestOmission[] = [];

  for (let index = 0; index < view.entries.length; index += 1) {
    const entry = view.entries[index]!;
    const contributed = view.contributions[index] ?? [];
    const edit = editsByTarget.get(entry.id);
    const rawMessages = entry.model ?? [];

    let status: RequestRawEntry["status"];
    let statusDetail: string | null = null;

    const kind = entryKindOf(entry);

    if (edit?.action === "omit") {
      status = "omitted_by_edit";
      statusDetail = `omitted by entry #${String(edit.byEntry)}`;
      omissions.push({ kind: "entry_edited", entry: entry.id, entryKind: kind, action: "omit", byEntry: edit.byEntry });
    } else if (edit?.action === "replace") {
      status = "replaced_by_edit";
      statusDetail = `replaced by entry #${String(edit.byEntry)}`;
      omissions.push({ kind: "entry_edited", entry: entry.id, entryKind: kind, action: "replace", byEntry: edit.byEntry });
    } else if (rawMessages.length === 0) {
      status = "display_only";
    } else if (contributed.length === 0) {
      const stopReason = excludedStopReason(rawMessages);
      status = "excluded_stop_reason";
      statusDetail = stopReason;
      omissions.push({ kind: "entry_excluded", entry: entry.id, entryKind: kind, stopReason });
    } else {
      status = "included";
    }

    rawEntries.push({
      id: entry.id,
      kind,
      head: entry.head ?? null,
      editsCount: entry.edits?.length ?? 0,
      status,
      statusDetail,
      modelMessages: rawMessages.map((message) => toRequestMessage(message, false)),
      contributedCount: contributed.length,
    });

    if (status === "included" && ToolResultEntry.is(entry)) {
      appendToolTruncationOmissions(entry, omissions);
    }
  }

  for (const message of effectiveMessages) {
    if (message.role === "toolResult" && message.synthesized) {
      omissions.push({ kind: "missing_tool_result", toolCallId: message.toolCallId, toolName: message.toolName });
    }
  }

  return { rawEntries, omissions };
}

/** Map Pi's internal entry kinds to Shrimpy's own contract names so clients never depend on Pi's identifiers. */
function entryKindOf(entry: EntryRecord): string {
  if (UserEntry.is(entry)) return "user";
  if (AssistantEntry.is(entry)) return "assistant";
  if (SystemEntry.is(entry)) return "system";
  if (ToolResultEntry.is(entry)) return "tool_result";
  if (CompactionEntry.is(entry)) return "compaction";
  if (ResetEntry.is(entry)) return "reset";
  return entry.kind;
}

function excludedStopReason(messages: readonly Message[]): string {
  const assistant = messages.find((message): message is AssistantMessage => message.role === "assistant");
  return assistant?.stopReason ?? "excluded";
}

function appendToolTruncationOmissions(entry: EntryRecord, omissions: RequestOmission[]): void {
  const data = entry.data as { diagnostics?: readonly ToolDiagnostic[] } | undefined;
  const toolResult = entry.model?.[0] as ToolResultMessage | undefined;
  const label = toolResult?.toolName ?? "tool";
  for (const diagnostic of data?.diagnostics ?? []) {
    const isTruncated =
      diagnostic.code === "truncated" ||
      diagnostic.code === "output_truncated" ||
      /\btruncat|\bcut\b|\bspill/i.test(diagnostic.message);
    if (isTruncated) {
      omissions.push({
        kind: "output_truncated",
        entry: entry.id,
        source: "tool_result",
        label,
        reason: diagnostic.message,
      });
    }
  }
}
