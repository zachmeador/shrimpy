import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { createInterface } from "node:readline";
import type { AppRuntime } from "../app/runtime.js";
import { isRecord } from "../util/record.js";

const LIFECYCLE_CUSTOM_TYPE = "shrimpy_lifecycle";
const DEFAULT_SEARCH_LIMIT = 25;
const DEFAULT_READ_WINDOW = 3;
const SEARCH_SNIPPET_CHARS = 220;
const READ_SNIPPET_CHARS = 420;

export type SessionLifecycleState = "active" | "archived";
export type SessionSearchMatchKind = "text" | "tool" | "command";

export interface SessionSearchMatch {
  agentId: string;
  sessionName: string;
  sessionPath: string;
  relativePath: string;
  lifecycleState: SessionLifecycleState;
  sessionLabel: string;
  sessionType: string;
  entryId: string;
  entryIndex: number;
  entryTimestamp: string | null;
  role: string;
  matchKind: SessionSearchMatchKind;
  toolName?: string;
  snippet: string;
}

export interface SessionSearchResult {
  query: string;
  filters: {
    agentId?: string;
    channel?: string;
    allAgents: boolean;
    limit: number;
  };
  totalSessions: number;
  totalEntries: number;
  matchedCount: number;
  returnedCount: number;
  matches: SessionSearchMatch[];
  hints: string[];
}

export interface SessionReadEntry {
  id: string;
  entryIndex: number;
  timestamp: string | null;
  role: string;
  toolName?: string;
  snippet: string;
}

export interface SessionReadResult {
  agentId: string;
  sessionName: string;
  sessionPath: string;
  relativePath: string;
  lifecycleState: SessionLifecycleState;
  sessionLabel: string;
  sessionType: string;
  aroundEntryId: string;
  window: number;
  entries: SessionReadEntry[];
}

interface SessionFileCandidate {
  agentId: string;
  sessionLabel: string;
  sessionType: string;
  path: string;
  name: string;
  relativePath: string;
  updatedAtMs: number;
}

interface ParsedSessionLine {
  entry: Record<string, unknown>;
  lineNumber: number;
}

interface SearchableEntry {
  id: string;
  entryIndex: number;
  timestamp: string | null;
  role: string;
  text: string;
  toolNames: string[];
  command?: string;
}

export async function searchSessionTranscripts(
  runtime: AppRuntime,
  input: {
    query: string;
    agentId?: string;
    channel?: string;
    allAgents?: boolean;
    limit?: number;
  },
): Promise<SessionSearchResult> {
  const query = input.query.trim();
  if (!query) throw new Error("query required");
  if (input.agentId && input.allAgents) {
    throw new Error("--agent and --all-agents cannot be used together");
  }

  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const candidates = listSessionFileCandidates(runtime, {
    agentId: input.agentId,
    channel: input.channel,
    allAgents: Boolean(input.allAgents),
  });
  const matches: SessionSearchMatch[] = [];
  let totalEntries = 0;

  for (const candidate of candidates) {
    const scanned = await scanSessionFileForMatches(runtime, candidate, query);
    totalEntries += scanned.entryCount;
    matches.push(...scanned.matches);
  }

  matches.sort((a, b) =>
    timestampMs(b.entryTimestamp) - timestampMs(a.entryTimestamp) ||
    b.relativePath.localeCompare(a.relativePath) ||
    b.entryIndex - a.entryIndex
  );

  const returned = matches.slice(0, limit);
  return {
    query,
    filters: {
      agentId: input.agentId,
      channel: input.channel,
      allAgents: Boolean(input.allAgents),
      limit,
    },
    totalSessions: candidates.length,
    totalEntries,
    matchedCount: matches.length,
    returnedCount: returned.length,
    matches: returned,
    hints: localSearchHints(),
  };
}

export async function readSessionAroundEntry(
  runtime: AppRuntime,
  input: {
    session: string;
    aroundEntryId: string;
    window?: number;
    agentId?: string;
  },
): Promise<SessionReadResult> {
  const window = input.window ?? DEFAULT_READ_WINDOW;
  const candidate = resolveSessionFile(runtime, input.session, input.agentId);
  const entries: SessionReadEntry[] = [];
  let lifecycleState: SessionLifecycleState = "active";
  let entryIndex = 0;

  for await (const { entry } of readJsonlEntries(candidate.path)) {
    const lifecycle = lifecycleStateFromEntry(entry);
    if (lifecycle) lifecycleState = lifecycle;
    const summary = summarizeSessionEntry(entry, entryIndex);
    if (summary) {
      entries.push(summary);
      entryIndex += 1;
    }
  }

  const aroundIndex = entries.findIndex((entry) => entry.id === input.aroundEntryId);
  if (aroundIndex === -1) {
    throw new Error(`entry not found in ${candidate.relativePath}: ${input.aroundEntryId}`);
  }

  const start = Math.max(0, aroundIndex - window);
  const end = Math.min(entries.length, aroundIndex + window + 1);
  return {
    agentId: candidate.agentId,
    sessionName: candidate.name,
    sessionPath: candidate.path,
    relativePath: candidate.relativePath,
    lifecycleState,
    sessionLabel: candidate.sessionLabel,
    sessionType: candidate.sessionType,
    aroundEntryId: input.aroundEntryId,
    window,
    entries: entries.slice(start, end),
  };
}

function listSessionFileCandidates(
  runtime: AppRuntime,
  input: {
    agentId?: string;
    channel?: string;
    allAgents: boolean;
  },
): SessionFileCandidate[] {
  const agents = input.allAgents
    ? runtime.resolved.agents
    : [runtime.getAgent(input.agentId)];
  const candidates: SessionFileCandidate[] = [];

  for (const agent of agents) {
    const sessionsRoot = runtime.getAgentPaths(agent.id).sessionsDir;
    const labels = input.channel
      ? [input.channel]
      : listDirectoryNames(sessionsRoot);

    for (const label of labels) {
      const sessionDir = join(sessionsRoot, label);
      if (!existsSync(sessionDir)) continue;
      for (const entry of readdirSync(sessionDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
        const path = join(sessionDir, entry.name);
        candidates.push({
          agentId: agent.id,
          sessionLabel: label,
          sessionType: sessionTypeForLabel(label),
          path,
          name: entry.name,
          relativePath: relative(runtime.paths.workspace, path),
          updatedAtMs: statSync(path).mtimeMs,
        });
      }
    }
  }

  return candidates.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

async function scanSessionFileForMatches(
  runtime: AppRuntime,
  candidate: SessionFileCandidate,
  query: string,
): Promise<{
  entryCount: number;
  matches: SessionSearchMatch[];
}> {
  const normalizedQuery = query.toLowerCase();
  const matches: SessionSearchMatch[] = [];
  let lifecycleState: SessionLifecycleState = "active";
  let entryCount = 0;

  for await (const { entry } of readJsonlEntries(candidate.path)) {
    const lifecycle = lifecycleStateFromEntry(entry);
    if (lifecycle) lifecycleState = lifecycle;
    const searchable = searchableSessionEntry(entry, entryCount);
    if (!searchable) continue;

    entryCount += 1;
    const match = matchSearchableEntry(searchable, normalizedQuery);
    if (!match) continue;

    matches.push({
      agentId: candidate.agentId,
      sessionName: candidate.name,
      sessionPath: candidate.path,
      relativePath: relative(runtime.paths.workspace, candidate.path),
      lifecycleState,
      sessionLabel: candidate.sessionLabel,
      sessionType: candidate.sessionType,
      entryId: searchable.id,
      entryIndex: searchable.entryIndex,
      entryTimestamp: searchable.timestamp,
      role: searchable.role,
      matchKind: match.kind,
      ...(match.toolName ? { toolName: match.toolName } : {}),
      snippet: match.snippet,
    });
  }

  return {
    entryCount,
    matches: matches.map((match) => ({
      ...match,
      lifecycleState,
    })),
  };
}

async function* readJsonlEntries(path: string): AsyncGenerator<ParsedSessionLine> {
  const lines = createInterface({
    input: createReadStream(path, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isRecord(parsed)) {
        yield { entry: parsed, lineNumber };
      }
    } catch {
      continue;
    }
  }
}

function resolveSessionFile(
  runtime: AppRuntime,
  session: string,
  agentId?: string,
): SessionFileCandidate {
  const directPath = isAbsolute(session)
    ? session
    : join(runtime.paths.workspace, session);
  if (existsSync(directPath)) {
    return candidateForPath(runtime, directPath, agentId);
  }

  const matches = listSessionFileCandidates(runtime, {
    agentId,
    allAgents: agentId === undefined,
  }).filter((candidate) =>
    candidate.name === session ||
    candidate.relativePath === session ||
    candidate.path === session ||
    `${candidate.sessionLabel}/${candidate.name}` === session
  );

  if (matches.length === 0) throw new Error(`session not found: ${session}`);
  if (matches.length > 1) {
    const choices = matches.map((match) => match.relativePath).slice(0, 5).join(", ");
    throw new Error(`session is ambiguous: ${session} (${choices})`);
  }
  return matches[0]!;
}

function candidateForPath(
  runtime: AppRuntime,
  path: string,
  agentId?: string,
): SessionFileCandidate {
  const candidates = listSessionFileCandidates(runtime, {
    agentId,
    allAgents: agentId === undefined,
  });
  const found = candidates.find((candidate) => candidate.path === path);
  if (found) return found;

  return {
    agentId: agentId ?? runtime.getAgent().id,
    sessionLabel: basename(join(path, "..")),
    sessionType: sessionTypeForLabel(basename(join(path, ".."))),
    path,
    name: basename(path),
    relativePath: relative(runtime.paths.workspace, path),
    updatedAtMs: statSync(path).mtimeMs,
  };
}

function searchableSessionEntry(
  entry: Record<string, unknown>,
  entryIndex: number,
): SearchableEntry | null {
  if (entry.type !== "message" || !isRecord(entry.message)) return null;
  const message = entry.message;
  const role = stringValue(message.role);
  if (!role) return null;

  const id = stringValue(entry.id) ?? `entry-${entryIndex}`;
  const timestamp = entryTimestamp(entry, message);

  if (role === "user") {
    const text = textFromContent(message.content);
    if (!text) return null;
    return { id, entryIndex, timestamp, role, text, toolNames: [] };
  }

  if (role === "assistant") {
    const text = textFromContent(message.content);
    const toolNames = toolNamesFromContent(message.content);
    if (!text && toolNames.length === 0) return null;
    return { id, entryIndex, timestamp, role, text, toolNames };
  }

  if (role === "toolResult") {
    const toolName = stringValue(message.toolName);
    if (!toolName) return null;
    return { id, entryIndex, timestamp, role, text: "", toolNames: [toolName] };
  }

  if (role === "bashExecution") {
    const command = stringValue(message.command);
    if (!command) return null;
    return { id, entryIndex, timestamp, role, text: "", toolNames: [], command };
  }

  return null;
}

function summarizeSessionEntry(
  entry: Record<string, unknown>,
  entryIndex: number,
): SessionReadEntry | null {
  if (entry.type !== "message" || !isRecord(entry.message)) return null;
  const message = entry.message;
  const role = stringValue(message.role);
  if (!role) return null;

  const id = stringValue(entry.id) ?? `entry-${entryIndex}`;
  const timestamp = entryTimestamp(entry, message);
  const toolName = role === "toolResult"
    ? stringValue(message.toolName)
    : undefined;
  const toolNames = role === "assistant"
    ? toolNamesFromContent(message.content)
    : [];

  let snippet = "";
  if (role === "user" || role === "assistant") {
    const text = textFromContent(message.content);
    const toolText = toolNames.length > 0
      ? `tools: ${toolNames.join(", ")}`
      : "";
    snippet = clipSnippet([text, toolText].filter(Boolean).join("\n"), READ_SNIPPET_CHARS);
  } else if (role === "toolResult") {
    snippet = `tool result: ${toolName ?? "(unknown)"} (body omitted)`;
  } else if (role === "bashExecution") {
    snippet = clipSnippet(`bash command: ${stringValue(message.command) ?? ""}`, READ_SNIPPET_CHARS);
  } else if (role === "custom" && message.display === true) {
    snippet = clipSnippet(textFromContent(message.content), READ_SNIPPET_CHARS);
  } else if (role === "branchSummary") {
    snippet = clipSnippet(stringValue(message.summary) ?? "", READ_SNIPPET_CHARS);
  } else if (role === "compactionSummary") {
    snippet = clipSnippet(stringValue(message.summary) ?? "", READ_SNIPPET_CHARS);
  }

  if (!snippet) return null;
  return {
    id,
    entryIndex,
    timestamp,
    role,
    ...(toolName ? { toolName } : {}),
    snippet,
  };
}

function matchSearchableEntry(
  entry: SearchableEntry,
  normalizedQuery: string,
): {
  kind: SessionSearchMatchKind;
  snippet: string;
  toolName?: string;
} | null {
  if (entry.text.toLowerCase().includes(normalizedQuery)) {
    return {
      kind: "text",
      snippet: snippetAround(entry.text, normalizedQuery, SEARCH_SNIPPET_CHARS),
    };
  }

  for (const toolName of entry.toolNames) {
    if (toolName.toLowerCase().includes(normalizedQuery)) {
      return {
        kind: "tool",
        toolName,
        snippet: `tool: ${toolName}`,
      };
    }
  }

  if (entry.command && entry.command.toLowerCase().includes(normalizedQuery)) {
    return {
      kind: "command",
      snippet: snippetAround(`bash command: ${entry.command}`, normalizedQuery, SEARCH_SNIPPET_CHARS),
    };
  }

  return null;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return normalizeWhitespace(content);
  if (!Array.isArray(content)) return "";
  return normalizeWhitespace(
    content.map((block) => {
      if (!isRecord(block)) return "";
      if (block.type === "text") return stringValue(block.text) ?? "";
      return "";
    }).filter(Boolean).join("\n"),
  );
}

function toolNamesFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    if (!isRecord(block) || block.type !== "toolCall") return [];
    const name = stringValue(block.name);
    return name ? [name] : [];
  });
}

function lifecycleStateFromEntry(entry: Record<string, unknown>): SessionLifecycleState | null {
  if (entry.type !== "custom" || entry.customType !== LIFECYCLE_CUSTOM_TYPE) return null;
  if (!isRecord(entry.data)) return null;
  return entry.data.state === "archived" ? "archived" : "active";
}

function listDirectoryNames(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function sessionTypeForLabel(label: string): string {
  if (label === "tui" || label === "run") return label;
  return "channel";
}

function entryTimestamp(
  entry: Record<string, unknown>,
  message: Record<string, unknown>,
): string | null {
  const fromEntry = stringValue(entry.timestamp);
  if (fromEntry) return fromEntry;
  const messageTimestamp = message.timestamp;
  if (typeof messageTimestamp === "number" && Number.isFinite(messageTimestamp)) {
    return new Date(messageTimestamp).toISOString();
  }
  return null;
}

function timestampMs(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function snippetAround(text: string, normalizedQuery: string, maxChars: number): string {
  const normalizedText = normalizeWhitespace(text);
  const index = normalizedText.toLowerCase().indexOf(normalizedQuery);
  if (index === -1) return clipSnippet(normalizedText, maxChars);
  const half = Math.floor(maxChars / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(normalizedText.length, start + maxChars);
  return `${start > 0 ? "..." : ""}${normalizedText.slice(start, end)}${end < normalizedText.length ? "..." : ""}`;
}

function clipSnippet(text: string, maxChars: number): string {
  const normalized = normalizeWhitespace(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 32))}... [truncated]`;
}

function localSearchHints(): string[] {
  return [
    "Use `shrimpy workspace search <query>` for profile, skill, context, and vault notes.",
    "Use `shrimpy channels search <channel> <query>` for channel logs.",
  ];
}
