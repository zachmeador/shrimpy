import type { Context } from "@earendil-works/chord/context";
import type { AssistantMessage, Message, ToolResultMessage } from "@earendil-works/pi-ai";
import {
  AssistantEntry,
  CompactionEntry,
  type Conversation,
  type ConversationId,
  type EntryId,
  type EntryQuery,
  type EntryRecord,
  type Harness,
  ResetEntry,
  ToolResultEntry,
  UserEntry,
} from "@earendil-works/pi-durable";
import { oneLine } from "../../lib/plain/index.ts";
import { cutEnd, matchesTerms, snippetAround } from "../../lib/text/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { type SessionRecord, SessionsDoc } from "../records/durable.ts";
import { formatEntryRef } from "./refs.ts";

/** Maximum raw entries scanned per session search so very long histories stay bounded. */
const MAX_SCAN_ENTRIES = 4_000;
/** Page size when scanning Pi entries. */
const SCAN_PAGE = 100;
/** Maximum characters rendered for a single entry in `history({ action: "read" })`. */
const MAX_ENTRY_CHARS = 2_500;
/** Maximum characters of serialized tool arguments kept in searchable/rendered assistant text. */
const MAX_ARGS_CHARS = 400;

/** One search hit inside an agent's Pi session history. */
export interface SessionHit {
  readonly threadId: string;
  readonly label: string;
  readonly entryId: number;
  readonly at: number | undefined;
  readonly kind: string;
  readonly preCompaction: boolean;
  readonly snippet: string;
}

/** One slice of readable session entries returned by `readSessionWindow`. */
export interface SessionWindow {
  readonly entries: readonly RenderedEntry[];
  readonly hasEarlier: boolean;
  /** Set when `mode: "compaction"` jumped to entries right before a compaction boundary. */
  readonly beforeCompaction?: number;
}

export interface RenderedEntry {
  readonly id: number;
  readonly at: number | undefined;
  readonly kind: string;
  readonly body: string;
}

/** Snapshot of all sessions the agent keeps, keyed by thread ID. */
export async function allSessions(harness: Harness, context: Context): Promise<Record<string, SessionRecord>> {
  return (await harness.snapshot(SessionsDoc, context))?.sessions ?? {};
}

/** Human-readable label for a session record. */
export function sessionLabel(threadId: string, session: SessionRecord | undefined, currentThreadId?: string): string {
  if (threadId === currentThreadId) return "this thread";
  const place = session?.place;
  if (place === undefined) return threadId;
  const named = place.thread.name === null ? "" : ` / ${place.thread.name}`;
  if (place.kind === "room") return `#${place.room}${named} (${threadId})`;
  return `DM with @${place.with.name}${named} (${threadId})`;
}

/**
 * Search one session's raw history (including pre-compaction entries) newest
 * first for entries matching every term in `terms`.
 */
export async function searchConversation(
  conversation: Conversation,
  info: { threadId: string; label: string },
  terms: readonly string[],
  limit: number,
  context: Context,
): Promise<SessionHit[]> {
  const hits: SessionHit[] = [];
  let cursor;
  let scanned = 0;
  let compactionHead: number | undefined;

  while (hits.length < limit && scanned < MAX_SCAN_ENTRIES) {
    const page = await conversation.entries({ order: "descending" }, SCAN_PAGE, cursor, context);
    for (const entry of page.items) {
      scanned += 1;
      if (CompactionEntry.is(entry)) {
        if (compactionHead === undefined && entry.head !== undefined) compactionHead = entry.head;
        continue;
      }
      const extracted = extractSearchable(entry);
      if (extracted === undefined) continue;
      if (!matchesTerms(extracted.text, terms)) continue;
      hits.push({
        threadId: info.threadId,
        label: info.label,
        entryId: entry.id,
        at: extracted.at,
        kind: extracted.kind,
        preCompaction: compactionHead !== undefined && entry.id < compactionHead,
        snippet: snippetAround(extracted.text, terms),
      });
      if (hits.length >= limit) break;
    }
    if (page.next === undefined || page.items.length === 0) break;
    cursor = page.next;
  }
  return hits;
}

/** Find the `head` (`firstKept`) entry ID of the newest compaction in `conversation`, or undefined. */
export async function latestCompactionHead(conversation: Conversation, context: Context): Promise<number | undefined> {
  let cursor;
  let scanned = 0;
  while (scanned < MAX_SCAN_ENTRIES) {
    const page = await conversation.entries({ order: "descending" }, SCAN_PAGE, cursor, context);
    for (const entry of page.items) {
      scanned += 1;
      if (CompactionEntry.is(entry) && entry.head !== undefined) return entry.head;
    }
    if (page.next === undefined || page.items.length === 0) break;
    cursor = page.next;
  }
  return undefined;
}

export type ReadWindowMode =
  | { readonly kind: "around"; readonly entryId: number }
  | { readonly kind: "before"; readonly entryId: number }
  | { readonly kind: "compaction" };

/** Read a window of readable session entries (user, assistant, tool results, compaction/reset markers). */
export async function readSessionWindow(
  conversation: Conversation,
  mode: ReadWindowMode,
  limit: number,
  context: Context,
): Promise<SessionWindow> {
  if (mode.kind === "compaction") {
    const head = await latestCompactionHead(conversation, context);
    if (head !== undefined && head > 1) {
      const page = await collectReadable(conversation, { maxEntryId: (head - 1) as EntryId, order: "descending" }, limit, context);
      return {
        entries: page.entries.reverse().map(renderEntry),
        hasEarlier: page.hasMore,
        beforeCompaction: head,
      };
    }
    const page = await collectReadable(conversation, { order: "descending" }, limit, context);
    return { entries: page.entries.reverse().map(renderEntry), hasEarlier: page.hasMore };
  }

  if (mode.kind === "before") {
    if (mode.entryId <= 1) return { entries: [], hasEarlier: false };
    const page = await collectReadable(
      conversation,
      { maxEntryId: (mode.entryId - 1) as EntryId, order: "descending" },
      limit,
      context,
    );
    return { entries: page.entries.reverse().map(renderEntry), hasEarlier: page.hasMore };
  }

  const halfBefore = Math.floor((limit - 1) / 2);
  const upTo = await collectReadable(
    conversation,
    { maxEntryId: mode.entryId as EntryId, order: "descending" },
    halfBefore + 1,
    context,
  );
  const beforeEntries = upTo.entries.reverse();
  const afterLimit = Math.max(limit - beforeEntries.length, limit - halfBefore - 1);
  const after =
    afterLimit <= 0
      ? { entries: [], hasMore: false }
      : await collectReadable(conversation, { minEntryId: (mode.entryId + 1) as EntryId, order: "ascending" }, afterLimit, context);

  let combined = [...beforeEntries, ...after.entries];
  let hasEarlier = upTo.hasMore;
  const oldest = beforeEntries[0];
  if (combined.length < limit && hasEarlier && oldest !== undefined && oldest.id > 1) {
    const extra = await collectReadable(
      conversation,
      { maxEntryId: (oldest.id - 1) as EntryId, order: "descending" },
      limit - combined.length,
      context,
    );
    combined = [...extra.entries.reverse(), ...combined];
    hasEarlier = extra.hasMore;
  }
  return { entries: combined.map(renderEntry), hasEarlier };
}

/** Open the conversation for a stored session, or undefined if missing. */
export async function openConversation(
  harness: Harness,
  session: SessionRecord | undefined,
  context: Context,
): Promise<Conversation | undefined> {
  if (session === undefined) return undefined;
  return harness.conversation(session.conversationId as ConversationId, context);
}

/** Format a list of rendered session entries for the `history` tool output. */
export function formatRenderedEntries(
  entries: readonly RenderedEntry[],
  threadId: string,
  currentThreadId: string | undefined,
  highlightEntryId?: number,
): string {
  return entries
    .map((entry) => {
      const ref = formatEntryRef(entry.id, threadId, currentThreadId);
      const when = entry.at === undefined ? "" : ` ${localTime(entry.at)}`;
      const mark = highlightEntryId !== undefined && entry.id === highlightEntryId ? " <-- match" : "";
      const header = `[${ref}]${when} · ${entry.kind}${mark}`;
      return entry.body === "" ? header : `${header}\n${entry.body}`;
    })
    .join("\n\n");
}

async function collectReadable(
  conversation: Conversation,
  query: Omit<EntryQuery, "conversationId">,
  want: number,
  context: Context,
): Promise<{ entries: EntryRecord[]; hasMore: boolean }> {
  const entries: EntryRecord[] = [];
  let cursor;
  let scanned = 0;
  const pageSize = Math.min(Math.max(want * 2, 25), SCAN_PAGE);
  let hasMore = false;

  while (scanned < MAX_SCAN_ENTRIES) {
    const page = await conversation.entries(query, pageSize, cursor, context);
    for (const entry of page.items) {
      scanned += 1;
      if (!isReadableEntry(entry)) continue;
      if (entries.length < want) {
        entries.push(entry);
      } else {
        hasMore = true;
        break;
      }
    }
    if (hasMore || page.next === undefined || page.items.length === 0) break;
    cursor = page.next;
  }
  return { entries, hasMore };
}

function isReadableEntry(entry: EntryRecord): boolean {
  if (UserEntry.is(entry)) return entry.model?.[0]?.role === "user";
  if (AssistantEntry.is(entry)) return entry.model?.[0]?.role === "assistant";
  if (ToolResultEntry.is(entry)) return entry.model?.[0]?.role === "toolResult";
  return CompactionEntry.is(entry) || ResetEntry.is(entry);
}

function extractSearchable(entry: EntryRecord): { kind: string; at: number | undefined; text: string } | undefined {
  const message = entry.model?.[0];
  if (UserEntry.is(entry) && message?.role === "user") {
    const text = contentText(message.content).trim();
    return text === "" ? undefined : { kind: "input", at: message.timestamp, text };
  }
  if (AssistantEntry.is(entry) && message?.role === "assistant") {
    // Skip `history` tool calls so a search never matches itself or earlier history lookups.
    const { text, hasReply } = assistantSearchText(message, true);
    return text === "" ? undefined : { kind: hasReply ? "assistant" : "tool call", at: message.timestamp, text };
  }
  if (ToolResultEntry.is(entry) && message?.role === "toolResult") {
    if (message.toolName === "history") return undefined;
    const text = stripHarness(contentText(message.content)).trim();
    return text === "" ? undefined : { kind: `tool ${message.toolName}`, at: message.timestamp, text };
  }
  return undefined;
}

function renderEntry(entry: EntryRecord): RenderedEntry {
  const message = entry.model?.[0];
  if (CompactionEntry.is(entry)) {
    const head = entry.head === undefined ? "" : ` (entries before e${String(entry.head)} summarized)`;
    return { id: entry.id, at: message?.timestamp, kind: "compaction", body: `--- session compacted${head} ---` };
  }
  if (ResetEntry.is(entry)) {
    return { id: entry.id, at: message?.timestamp, kind: "reset", body: "--- session reset ---" };
  }
  if (UserEntry.is(entry) && message?.role === "user") {
    return { id: entry.id, at: message.timestamp, kind: "input", body: bound(contentText(message.content).trim()) };
  }
  if (AssistantEntry.is(entry) && message?.role === "assistant") {
    const { text, hasReply } = assistantSearchText(message);
    return { id: entry.id, at: message.timestamp, kind: hasReply ? "assistant" : "tool call", body: bound(text) };
  }
  if (ToolResultEntry.is(entry) && message?.role === "toolResult") {
    const raw = stripHarness(contentText(message.content)).trim();
    const status = message.isError ? " (error)" : "";
    return { id: entry.id, at: message.timestamp, kind: `tool ${message.toolName}${status}`, body: bound(raw) };
  }
  return { id: entry.id, at: message?.timestamp, kind: entry.kind, body: "" };
}

function assistantSearchText(message: AssistantMessage, excludeHistory = false): { text: string; hasReply: boolean } {
  const replies: string[] = [];
  const calls: string[] = [];
  for (const block of message.content) {
    if (block.type === "text" && block.text.trim() !== "") replies.push(block.text.trim());
    else if (block.type === "toolCall") {
      if (excludeHistory && block.name === "history") continue;
      const args = cutEnd(oneLine(JSON.stringify(block.arguments)), MAX_ARGS_CHARS);
      calls.push(`${block.name}(${args})`);
    }
  }
  const parts = [...replies, ...calls.map((call) => `call: ${call}`)];
  return { text: parts.join("\n"), hasReply: replies.length > 0 };
}

function contentText(content: Message["content"] | ToolResultMessage["content"]): string {
  if (typeof content === "string") return content;
  return content
    .flatMap((block) => (block.type === "text" ? [block.text] : block.type === "image" ? ["[image]"] : []))
    .join("\n");
}

function stripHarness(text: string): string {
  return text.replace(/\n?<harness>[\s\S]*<\/harness>\s*$/, "");
}

function bound(text: string): string {
  if (text.length <= MAX_ENTRY_CHARS) return text;
  return `${text.slice(0, MAX_ENTRY_CHARS)}\n… (${String(text.length - MAX_ENTRY_CHARS)} more characters truncated)`;
}
