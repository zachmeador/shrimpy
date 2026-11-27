import type { Context } from "@earendil-works/chord/context";
import { defineTool, type Harness, type ToolExecutionApi } from "@earendil-works/pi-durable";
import { bool, int, obj, oneOf, opt, str } from "@earendil-works/pi-schema";
import type { SearchHit } from "../../contracts/chat/index.ts";
import { parseSearchTerms } from "../../lib/text/index.ts";
import { type ChatToolsOptions, reactorNames } from "../chat-tools/durable.ts";
import { filesOfMessages } from "../chat/index.ts";
import type { KeptFiles } from "../home/index.ts";
import { answer, failure } from "../host/durable.ts";
import { standing } from "../inputs/index.ts";
import { callSignal, chatFailure, type LiveChat, readableChannels } from "../links/index.ts";
import { type SessionRecord, threadOfSession } from "../records/durable.ts";
import { formatChatHit, formatSessionHit } from "./format.ts";
import { formatEntryRef, formatMessageRef, parseHistoryRef } from "./refs.ts";
import { resolveReadTarget, resolveSearchScope, type SearchScope } from "./scope.durable.ts";
import {
  allSessions,
  formatRenderedEntries,
  openConversation,
  readSessionWindow,
  searchConversation,
  type SessionHit,
  sessionLabel,
} from "./session.durable.ts";

const DEFAULT_SEARCH_LIMIT = 15;
const DEFAULT_READ_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_QUERY_LENGTH = 500;
const MAX_QUERY_TERMS = 12;

const HISTORY_DESCRIPTION =
  "Search and read past conversation history, including pre-compaction session entries (messages, tool calls, and tool outputs) and chat history across rooms and DMs. " +
  'Use action: "search" with `query` (space-separated terms all required; wrap phrases in double quotes). ' +
  'Omit `in` and `all` to search this thread, pass `all: true` to search all readable channels and your own sessions, or pass `in` ("th_...", "#room", "#room/<thread>", "@name", or "@name/<thread>") to narrow. ' +
  'Use action: "read" with a `ref` from search (e.g. "e87", "th_...#e14", or "th_...#m418") to read surrounding context, `before` to step further back, or neither to inspect entries right before the latest compaction in this thread.';

/** The `history` tool: search and inspect pre-compaction session history and chat messages. */
export function historyTool(harness: Harness, options: ChatToolsOptions) {
  return defineTool({
    name: "history",
    description: HISTORY_DESCRIPTION,
    parameters: obj({
      action: oneOf(["search", "read"] as const, {
        description: "What to do: search history by text, or read entries/messages around a hit or before compaction.",
      }),
      query: opt(str({ description: 'For action: search — terms to match (case-insensitive; use "quotes" for an exact phrase).' })),
      in: opt(str({ description: 'Optional place: "th_...", "@name", "@name/<thread>", "#room", or "#room/<thread>". Omit for this thread.' })),
      all: opt(bool({ description: "For action: search — true to search all readable channels and your own sessions (cannot combine with `in`)." })),
      ref: opt(str({ description: 'For action: read — hit reference from search ("e87", "th_...#e14", or "th_...#m418") to read surrounding context.' })),
      before: opt(str({ description: 'For action: read — step backward before an entry ("e71", "th_...#e71") or message ("th_...#m418").' })),
      limit: opt(int({ minimum: 1, maximum: MAX_LIMIT, description: "Max hits per source for search (default 15) or entries/messages for read (default 12)." })),
    }),
    outputLimits: { retain: "head" },
    async execute(args, api, context) {
      if (args.action === "search") return runSearch(harness, options, args, api, context);
      return runRead(harness, options, args, api, context);
    },
  });
}

type SearchArgs = { query?: string; in?: string; all?: boolean; limit?: number };
type ReadArgs = { in?: string; ref?: string; before?: string; limit?: number };

async function runSearch(
  harness: Harness,
  options: ChatToolsOptions,
  args: SearchArgs,
  api: ToolExecutionApi,
  context: Context,
) {
  const rawQuery = args.query?.trim() ?? "";
  if (rawQuery === "") return failure("Give `query` to search history.");
  if (rawQuery.length > MAX_QUERY_LENGTH) return failure(`Search query holds at most ${String(MAX_QUERY_LENGTH)} characters.`);
  const terms = parseSearchTerms(rawQuery);
  if (terms.length === 0) return failure("Give `query` to search history.");
  if (terms.length > MAX_QUERY_TERMS) return failure(`Search query takes at most ${String(MAX_QUERY_TERMS)} terms.`);
  if (args.all === true && args.in !== undefined && args.in.trim() !== "") {
    return failure("Pass either `all: true` or `in`, not both.");
  }

  const limit = args.limit ?? DEFAULT_SEARCH_LIMIT;
  const current = await threadOfSession(api, api.conversationId, context);
  const live = options.chat();
  const scope = await resolveSearchScope(args.in, args.all === true, current, live, options, api, context);
  if ("problem" in scope) return failure(scope.problem);

  const sessions = await allSessions(harness, context);
  const sessionHits = await searchSessionsForScope(harness, sessions, scope, current?.threadId, terms, limit, context);

  let chatHits: SearchHit[] = [];
  let chatNote: string | undefined;
  if (live === undefined) {
    if (scope.kind === "channel") return failure("Chat is not reachable right now. Try again later.");
    chatNote = "Chat is not reachable right now; showing local session history only.";
  } else {
    const signal = callSignal(live, context);
    try {
      const request =
        scope.kind === "all"
          ? { query: rawQuery, limit }
          : scope.kind === "channel"
            ? { query: rawQuery, channel: scope.channelId, limit }
            : { query: rawQuery, thread: scope.threadId, limit };
      chatHits = await live.chat.search(request, signal);
    } catch (error) {
      const why = chatFailure(error, live, context);
      if ("refused" in why) {
        if (sessionHits.length === 0) return failure(`Chat refused the search: ${why.refused}`);
        chatNote = `Chat search was refused (${why.refused}); showing local session history only.`;
      } else if (sessionHits.length === 0) {
        return failure("Chat is not reachable right now. Try again later.");
      } else {
        chatNote = "Chat was lost during search; showing local session history only.";
      }
    }
  }

  if (sessionHits.length === 0 && chatHits.length === 0) {
    const note = chatNote === undefined ? "" : ` (${chatNote})`;
    return answer(`No matches for "${rawQuery}" in ${scope.label}.${note}`);
  }

  const sections: string[] = [`Matches for "${rawQuery}" in ${scope.label}:`];
  if (chatNote !== undefined) sections.push(`Note: ${chatNote}`);
  if (sessionHits.length > 0) {
    sections.push("", "Session history (includes tool calls and pre-compaction entries):", ...sessionHits.map((hit) => formatSessionHit(hit, current?.threadId)));
  }
  if (chatHits.length > 0 && live !== undefined) {
    const channels = readableChannels(live.chat);
    sections.push("", "Chat messages:", ...chatHits.map((hit) => formatChatHit(hit, channels, live.self.id, current?.threadId, terms)));
  }
  sections.push("", 'Call history({ action: "read", ref: "<ref>" }) to inspect surrounding context.');
  return answer(sections.join("\n"));
}

async function runRead(
  harness: Harness,
  options: ChatToolsOptions,
  args: ReadArgs,
  api: ToolExecutionApi,
  context: Context,
) {
  if (args.ref !== undefined && args.before !== undefined) {
    return failure("Pass either `ref` or `before`, not both.");
  }
  const limit = args.limit ?? DEFAULT_READ_LIMIT;
  const current = await threadOfSession(api, api.conversationId, context);

  const rawRef = args.ref ?? args.before;
  const parsed = rawRef === undefined ? undefined : parseHistoryRef(rawRef);
  if (rawRef !== undefined && parsed === undefined) {
    return failure(`Invalid reference "${rawRef}". Expected e<id>, th_...#e<id>, m<seq>, or th_...#m<seq>.`);
  }

  const live = options.chat();
  const target = await resolveReadTarget(parsed?.threadId, args.in, current, live, options, api, context);
  if ("problem" in target) return failure(target.problem);

  if (parsed?.kind === "message") {
    if (live === undefined) return failure("Chat is not reachable right now. Try again later.");
    return readChatSlice(live, options.files, target.threadId, target.label ?? target.threadId, parsed.seq, args.before !== undefined, limit, context);
  }

  const sessions = await allSessions(harness, context);
  const record = Object.hasOwn(sessions, target.threadId) ? sessions[target.threadId] : undefined;
  const conversation = await openConversation(harness, record, context);
  if (conversation === undefined) {
    return failure(
      `You have no local session for ${target.label ?? target.threadId}. Use thread({ action: "read", thread: "${target.threadId}" }) to read its chat messages.`,
    );
  }

  const mode =
    parsed !== undefined
      ? args.before !== undefined
        ? ({ kind: "before", entryId: parsed.entryId } as const)
        : ({ kind: "around", entryId: parsed.entryId } as const)
      : ({ kind: "compaction" } as const);
  const window = await readSessionWindow(conversation, mode, limit, context);
  const label = target.label ?? sessionLabel(target.threadId, record, current?.threadId);
  if (window.entries.length === 0) {
    if (mode.kind === "before") {
      return answer(`No earlier session entries before ${formatEntryRef(mode.entryId, target.threadId, current?.threadId)} in ${label}.`);
    }
    return answer(`No session entries found in ${label}.`);
  }

  const heading =
    window.beforeCompaction !== undefined
      ? `Session entries before compaction (e${String(window.beforeCompaction)}) in ${label}, oldest first:`
      : `Session entries in ${label}, oldest first:`;
  const highlight = mode.kind === "around" ? mode.entryId : undefined;
  const lines = [heading, "", formatRenderedEntries(window.entries, target.threadId, current?.threadId, highlight)];
  const oldest = window.entries[0];
  if (window.hasEarlier && oldest !== undefined) {
    const beforeRef = formatEntryRef(oldest.id, target.threadId, current?.threadId);
    lines.push("", `Earlier entries exist. Call history({ action: "read", before: "${beforeRef}" }) to read further back.`);
  }
  return answer(lines.join("\n"));
}

async function readChatSlice(
  live: LiveChat,
  files: KeptFiles,
  threadId: string,
  label: string,
  seq: number,
  isBefore: boolean,
  limit: number,
  context: Context,
) {
  const signal = callSignal(live, context);
  try {
    const found = isBefore
      ? await live.chat.read(threadId, seq, limit + 1, signal)
      : await live.chat.around(threadId, seq, limit, signal);
    const hasEarlier = isBefore ? found.length > limit : false;
    const shown = isBefore && hasEarlier ? found.slice(found.length - limit) : found;
    const oldest = shown[0];
    if (oldest === undefined) {
      return answer(isBefore ? `No earlier messages in ${label}.` : `No messages around seq ${String(seq)} in ${label}.`);
    }
    const nameOf = reactorNames(live.chat, shown);
    const placed = await filesOfMessages({ chat: live.chat, files, signal }, shown);
    const body = shown
      .map((message, index) => {
        const ref = formatMessageRef(message.seq, message.threadId);
        const mark = !isBefore && message.seq === seq ? " <-- match" : "";
        return `[${ref}]${mark} ${standing(message, nameOf, placed[index])}`;
      })
      .join("\n\n");
    const heading = label === threadId ? threadId : `${label} (${threadId})`;
    const lines = [`Chat messages in ${heading}, oldest first:`, "", body];
    if (hasEarlier || (!isBefore && oldest.seq > 1)) {
      const beforeRef = formatMessageRef(oldest.seq, threadId);
      lines.push("", `To read earlier messages, call history({ action: "read", before: "${beforeRef}" }).`);
    }
    return answer(lines.join("\n"));
  } catch (error) {
    const why = chatFailure(error, live, context);
    return failure("refused" in why ? `Chat refused the request: ${why.refused}` : "Chat is not reachable right now. Try again later.");
  }
}

async function searchSessionsForScope(
  harness: Harness,
  sessions: Record<string, SessionRecord>,
  scope: Exclude<SearchScope, { problem: string }>,
  currentThreadId: string | undefined,
  terms: readonly string[],
  limit: number,
  context: Context,
): Promise<SessionHit[]> {
  let candidates: [string, SessionRecord][];
  if (scope.kind === "thread") {
    const one = Object.hasOwn(sessions, scope.threadId) ? sessions[scope.threadId] : undefined;
    candidates = one === undefined ? [] : [[scope.threadId, one]];
  } else if (scope.kind === "channel") {
    candidates = Object.entries(sessions)
      .filter(([, record]) => record.channelId === scope.channelId)
      .sort((a, b) => orderSessions(a, b, currentThreadId));
  } else {
    candidates = Object.entries(sessions).sort((a, b) => orderSessions(a, b, currentThreadId));
  }

  const hits: SessionHit[] = [];
  for (const [threadId, record] of candidates) {
    const remaining = limit - hits.length;
    if (remaining <= 0) break;
    const conversation = await openConversation(harness, record, context);
    if (conversation === undefined) continue;
    const label = sessionLabel(threadId, record, currentThreadId);
    hits.push(...(await searchConversation(conversation, { threadId, label }, terms, remaining, context)));
  }
  return hits;
}

function orderSessions(
  a: [string, SessionRecord],
  b: [string, SessionRecord],
  currentThreadId: string | undefined,
): number {
  if (a[0] === currentThreadId) return -1;
  if (b[0] === currentThreadId) return 1;
  return b[1].conversationId - a[1].conversationId;
}
