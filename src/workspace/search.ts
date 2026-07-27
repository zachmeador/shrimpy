import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { basename, extname, join, relative } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import { writeJsonFileAtomic } from "../util/json-file.js";
import { isRecord } from "../util/record.js";

const INDEX_VERSION = 3;
const SCORER_ID = "keyword-bm25-v1";
const DEFAULT_LIMIT: number = 10;
const MAX_SNIPPET_CHARS = 220;
const TOKEN_PATTERN = /[a-z0-9_./:-]+/gi;

export interface WorkspaceSearchChunk {
  id: string;
  path: string;
  headingTrail: string[];
  lineStart: number;
  lineEnd: number;
  text: string;
}

export interface WorkspaceSearchIndexedFile {
  path: string;
  visibility: WorkspaceKnowledgeVisibility;
  hash: string;
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  lastModifiedAt: string;
  contentChangedAt: string;
  chunks: WorkspaceSearchChunk[];
}

export type WorkspaceKnowledgeVisibility =
  | { scope: "workspace" }
  | { scope: "agents"; agentIds: string[] };

export interface WorkspaceSearchIndex {
  version: number;
  scorerId: string;
  embeddingModel: string;
  generatedAt: string;
  files: WorkspaceSearchIndexedFile[];
}

export interface WorkspaceSearchResultItem {
  path: string;
  headingTrail: string[];
  score: number;
  keywordScore: number;
  recencyScore: number;
  snippet: string;
  lastModifiedAt: string;
  contentChangedAt: string;
  lineStart: number;
  lineEnd: number;
}

export interface WorkspaceSearchResult {
  query: string;
  limit: number;
  agentId: string;
  knowledgeScope: "agent" | "global";
  indexPath: string;
  scorerId: string;
  embedding: WorkspaceEmbeddingStatus;
  corpusFiles: number;
  indexedChunks: number;
  refreshedFiles: number;
  removedFiles: number;
  matchedCount: number;
  returnedCount: number;
  results: WorkspaceSearchResultItem[];
  hints: string[];
}

export interface WorkspaceIndexStatus {
  indexPath: string;
  exists: boolean;
  version: number;
  scorerId: string;
  expectedScorerId: string;
  embeddingModel: string;
  expectedEmbeddingModel: string;
  embedding: WorkspaceEmbeddingStatus;
  corpusFiles: number;
  indexedFiles: number;
  indexedChunks: number;
  staleFiles: number;
  unindexedFiles: number;
  removedFiles: number;
  needsRebuild: boolean;
  generatedAt?: string;
}

export interface WorkspaceIndexRefreshResult {
  indexPath: string;
  index: WorkspaceSearchIndex;
  corpusFiles: number;
  refreshedFiles: number;
  removedFiles: number;
  rebuilt: boolean;
}

export interface WorkspaceEmbeddingStatus {
  enabled: boolean;
  available: boolean;
  backend: string;
  model: string;
  note: string;
}

interface CorpusFileMetadata {
  path: string;
  absolutePath: string;
  visibility: WorkspaceKnowledgeVisibility;
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  lastModifiedAt: string;
}

interface CorpusFileSnapshot extends CorpusFileMetadata {
  hash: string;
  content: string;
}

interface RankedChunk {
  chunk: WorkspaceSearchChunk;
  file: WorkspaceSearchIndexedFile;
  keywordScore: number;
  recencyScore: number;
  score: number;
}

export async function searchWorkspaceKnowledge(
  runtime: AppRuntime,
  input: {
    query: string;
    limit?: number;
    agentId?: string;
    allAgents?: boolean;
  },
): Promise<WorkspaceSearchResult> {
  const query = input.query.trim();
  if (!query) throw new Error("query required");
  if (input.agentId && input.allAgents) {
    throw new Error("agentId and allAgents are mutually exclusive");
  }
  const limit = input.limit ?? DEFAULT_LIMIT;
  const agent = runtime.getAgent(input.agentId);
  const knowledgeScope = input.allAgents || agent.knowledgeScope === "global"
    ? "global"
    : "agent";
  const refresh = refreshWorkspaceSearchIndex(runtime);
  const visibleFiles = refresh.index.files.filter((file) =>
    knowledgeScope === "global" ||
    file.visibility.scope === "workspace" ||
    file.visibility.agentIds.includes(agent.id)
  );
  const chunks = visibleFiles.flatMap((file) =>
    file.chunks.map((chunk) => ({ file, chunk }))
  );
  const ranked = rankChunks(chunks, query);
  const returned = ranked.slice(0, limit);

  return {
    query,
    limit,
    agentId: agent.id,
    knowledgeScope,
    indexPath: workspaceSearchIndexPath(runtime),
    scorerId: SCORER_ID,
    embedding: workspaceEmbeddingStatus(runtime),
    corpusFiles: visibleFiles.length,
    indexedChunks: chunks.length,
    refreshedFiles: refresh.refreshedFiles,
    removedFiles: refresh.removedFiles,
    matchedCount: ranked.length,
    returnedCount: returned.length,
    results: returned.map((rankedChunk) =>
      toWorkspaceSearchResultItem(rankedChunk, query)
    ),
    hints: localSearchHints(),
  };
}

export function inspectWorkspaceSearchIndex(runtime: AppRuntime): WorkspaceIndexStatus {
  const indexPath = workspaceSearchIndexPath(runtime);
  const index = loadWorkspaceSearchIndex(indexPath);
  const snapshots = collectCorpusFileSnapshots(runtime);
  const snapshotByPath = new Map(snapshots.map((snapshot) => [snapshot.path, snapshot]));
  const indexedByPath = new Map((index?.files ?? []).map((file) => [file.path, file]));
  const expectedEmbeddingModel = workspaceEmbeddingModel(runtime);
  let staleFiles = 0;
  let unindexedFiles = 0;

  for (const snapshot of snapshots) {
    const indexed = indexedByPath.get(snapshot.path);
    if (!indexed) {
      unindexedFiles += 1;
      continue;
    }
    if (
      indexed.hash !== snapshot.hash ||
      !sameVisibility(indexed.visibility, snapshot.visibility)
    ) {
      staleFiles += 1;
    }
  }

  const removedFiles = [...indexedByPath.keys()]
    .filter((path) => !snapshotByPath.has(path)).length;
  const metadataMismatch = !index ||
    index.version !== INDEX_VERSION ||
    index.scorerId !== SCORER_ID ||
    index.embeddingModel !== expectedEmbeddingModel;

  return {
    indexPath,
    exists: Boolean(index),
    version: index?.version ?? INDEX_VERSION,
    scorerId: index?.scorerId ?? "(none)",
    expectedScorerId: SCORER_ID,
    embeddingModel: index?.embeddingModel ?? "(none)",
    expectedEmbeddingModel,
    embedding: workspaceEmbeddingStatus(runtime),
    corpusFiles: snapshots.length,
    indexedFiles: index?.files.length ?? 0,
    indexedChunks: index?.files.reduce((count, file) => count + file.chunks.length, 0) ?? 0,
    staleFiles,
    unindexedFiles,
    removedFiles,
    needsRebuild: metadataMismatch || staleFiles > 0 || unindexedFiles > 0 || removedFiles > 0,
    ...(index?.generatedAt ? { generatedAt: index.generatedAt } : {}),
  };
}

function toWorkspaceSearchResultItem(
  rankedChunk: RankedChunk,
  query: string,
): WorkspaceSearchResultItem {
  return {
    path: rankedChunk.chunk.path,
    headingTrail: rankedChunk.chunk.headingTrail,
    score: roundScore(rankedChunk.score),
    keywordScore: roundScore(rankedChunk.keywordScore),
    recencyScore: roundScore(rankedChunk.recencyScore),
    snippet: snippetForChunk(rankedChunk.chunk, query),
    lastModifiedAt: rankedChunk.file.lastModifiedAt,
    contentChangedAt: rankedChunk.file.contentChangedAt,
    lineStart: rankedChunk.chunk.lineStart,
    lineEnd: rankedChunk.chunk.lineEnd,
  };
}

export function rebuildWorkspaceSearchIndex(runtime: AppRuntime): WorkspaceIndexRefreshResult {
  const indexPath = workspaceSearchIndexPath(runtime);
  if (existsSync(indexPath)) rmSync(indexPath, { force: true });
  return refreshWorkspaceSearchIndex(runtime, { force: true });
}

export function refreshWorkspaceSearchIndex(
  runtime: AppRuntime,
  opts: {
    force?: boolean;
  } = {},
): WorkspaceIndexRefreshResult {
  const indexPath = workspaceSearchIndexPath(runtime);
  const expectedEmbeddingModel = workspaceEmbeddingModel(runtime);
  const existing = !opts.force ? loadWorkspaceSearchIndex(indexPath) : null;
  const metadataMatches = existing !== null &&
    existing.version === INDEX_VERSION &&
    existing.scorerId === SCORER_ID &&
    existing.embeddingModel === expectedEmbeddingModel;
  const usableExisting = metadataMatches ? existing : null;
  const existingByPath = new Map((usableExisting?.files ?? []).map((file) => [file.path, file]));
  const corpusFiles = collectCorpusFileMetadata(runtime);
  const files: WorkspaceSearchIndexedFile[] = [];
  let refreshedFiles = 0;
  let indexChanged = !metadataMatches;

  for (const metadata of corpusFiles) {
    const previous = existingByPath.get(metadata.path);
    if (
      previous &&
      sameVisibility(previous.visibility, metadata.visibility) &&
      previous.mtimeMs === metadata.mtimeMs &&
      previous.ctimeMs === metadata.ctimeMs &&
      previous.size === metadata.size
    ) {
      files.push(previous);
      continue;
    }

    if (
      previous &&
      previous.mtimeMs === metadata.mtimeMs &&
      previous.ctimeMs === metadata.ctimeMs &&
      previous.size === metadata.size
    ) {
      indexChanged = true;
      files.push({
        ...previous,
        visibility: metadata.visibility,
      });
      continue;
    }

    const snapshot = readCorpusFileSnapshot(metadata);
    indexChanged = true;
    if (previous && previous.hash === snapshot.hash) {
      files.push({
        ...previous,
        visibility: snapshot.visibility,
        mtimeMs: snapshot.mtimeMs,
        ctimeMs: snapshot.ctimeMs,
        size: snapshot.size,
        lastModifiedAt: snapshot.lastModifiedAt,
      });
      continue;
    }

    refreshedFiles += 1;
    files.push({
      path: snapshot.path,
      visibility: snapshot.visibility,
      hash: snapshot.hash,
      mtimeMs: snapshot.mtimeMs,
      ctimeMs: snapshot.ctimeMs,
      size: snapshot.size,
      lastModifiedAt: snapshot.lastModifiedAt,
      contentChangedAt: previous
        ? new Date().toISOString()
        : snapshot.lastModifiedAt,
      chunks: chunkMarkdownFile(snapshot.path, snapshot.content),
    });
  }

  const snapshotPaths = new Set(corpusFiles.map((file) => file.path));
  const removedFiles = [...existingByPath.keys()]
    .filter((path) => !snapshotPaths.has(path)).length;
  indexChanged ||= removedFiles > 0;
  if (!indexChanged && usableExisting) {
    return {
      indexPath,
      index: usableExisting,
      corpusFiles: corpusFiles.length,
      refreshedFiles: 0,
      removedFiles: 0,
      rebuilt: false,
    };
  }

  const index: WorkspaceSearchIndex = {
    version: INDEX_VERSION,
    scorerId: SCORER_ID,
    embeddingModel: expectedEmbeddingModel,
    generatedAt: new Date().toISOString(),
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  writeJsonFileAtomic(indexPath, index);

  return {
    indexPath,
    index,
    corpusFiles: corpusFiles.length,
    refreshedFiles,
    removedFiles,
    rebuilt: opts.force === true || !metadataMatches,
  };
}

export function workspaceEmbeddingStatus(runtime: AppRuntime): WorkspaceEmbeddingStatus {
  const enabled = workspaceEmbeddingsEnabled(runtime);
  if (!enabled) {
    return {
      enabled: false,
      available: false,
      backend: "none",
      model: "disabled",
      note: "Workspace embeddings are disabled; keyword search is active.",
    };
  }

  return {
    enabled: true,
    available: false,
    backend: "none",
    model: "unavailable",
    note: "Workspace embeddings are enabled in config, but no local embedding backend is installed; keyword search is active.",
  };
}

function rankChunks(
  chunks: Array<{ file: WorkspaceSearchIndexedFile; chunk: WorkspaceSearchChunk }>,
  query: string,
): RankedChunk[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const docs = chunks.map(({ file, chunk }) => ({
    file,
    chunk,
    text: searchableChunkText(chunk),
    tokens: tokenize(searchableChunkText(chunk)),
  }));
  const avgDocLength = docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / Math.max(1, docs.length);
  const documentFrequency = new Map<string, number>();
  for (const doc of docs) {
    for (const token of new Set(doc.tokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const ranked: RankedChunk[] = [];
  for (const doc of docs) {
    const keywordScore = bm25Score({
      queryTokens,
      documentTokens: doc.tokens,
      documentCount: docs.length,
      avgDocLength,
      documentFrequency,
    }) + phraseBoost(doc.chunk, query);
    if (keywordScore <= 0) continue;

    const recencyScore = contentRecencyScore(doc.file.contentChangedAt);
    const score = keywordScore * (1 + recencyScore * 0.08);
    ranked.push({
      chunk: doc.chunk,
      file: doc.file,
      keywordScore,
      recencyScore,
      score,
    });
  }

  return ranked.sort((a, b) =>
    b.score - a.score ||
    Date.parse(b.file.contentChangedAt) - Date.parse(a.file.contentChangedAt) ||
    a.chunk.path.localeCompare(b.chunk.path)
  );
}

function bm25Score(input: {
  queryTokens: string[];
  documentTokens: string[];
  documentCount: number;
  avgDocLength: number;
  documentFrequency: Map<string, number>;
}): number {
  const k1 = 1.2;
  const b = 0.75;
  const termFrequency = new Map<string, number>();
  for (const token of input.documentTokens) {
    termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
  }

  let score = 0;
  for (const token of input.queryTokens) {
    const tf = termFrequency.get(token) ?? 0;
    if (tf === 0) continue;
    const df = input.documentFrequency.get(token) ?? 0;
    const idf = Math.log(1 + (input.documentCount - df + 0.5) / (df + 0.5));
    const denominator = tf + k1 * (1 - b + b * (input.documentTokens.length / Math.max(1, input.avgDocLength)));
    score += idf * ((tf * (k1 + 1)) / denominator);
  }
  return score;
}

function phraseBoost(chunk: WorkspaceSearchChunk, query: string): number {
  const normalizedQuery = query.toLowerCase();
  const text = chunk.text.toLowerCase();
  const heading = chunk.headingTrail.join(" ").toLowerCase();
  const path = chunk.path.toLowerCase();
  let boost = 0;
  if (text.includes(normalizedQuery)) boost += 2;
  if (heading.includes(normalizedQuery)) boost += 1.5;
  if (path.includes(normalizedQuery)) boost += 1;
  return boost;
}

function contentRecencyScore(contentChangedAt: string): number {
  const parsed = Date.parse(contentChangedAt);
  if (!Number.isFinite(parsed)) return 0.2;
  const ageDays = Math.max(0, (Date.now() - parsed) / 86_400_000);
  return 0.2 + 0.8 * Math.exp(-ageDays / 180);
}

function collectCorpusFileSnapshots(runtime: AppRuntime): CorpusFileSnapshot[] {
  return collectCorpusFileMetadata(runtime).map(readCorpusFileSnapshot);
}

function collectCorpusFileMetadata(runtime: AppRuntime): CorpusFileMetadata[] {
  return collectCorpusFiles(runtime).map(({ absolutePath, visibility }) => {
    const stats = statSync(absolutePath);
    return {
      path: relative(runtime.paths.workspace, absolutePath),
      absolutePath,
      visibility,
      mtimeMs: stats.mtimeMs,
      ctimeMs: stats.ctimeMs,
      size: stats.size,
      lastModifiedAt: new Date(stats.mtimeMs).toISOString(),
    };
  }).sort((a, b) => a.path.localeCompare(b.path));
}

function readCorpusFileSnapshot(
  metadata: CorpusFileMetadata,
): CorpusFileSnapshot {
  const content = readFileSync(metadata.absolutePath, "utf-8");
  return {
    ...metadata,
    hash: createHash("sha256").update(content).digest("hex"),
    content,
  };
}

function collectCorpusFiles(runtime: AppRuntime): Array<{
  absolutePath: string;
  visibility: WorkspaceKnowledgeVisibility;
}> {
  const paths = new Map<string, WorkspaceKnowledgeVisibility>();
  addMarkdownTree(
    runtime.paths.workspace,
    runtime.paths.workspaceContextDir,
    paths,
    { scope: "workspace" },
  );
  addMarkdownTree(
    runtime.paths.workspace,
    join(runtime.paths.workspace, "skills"),
    paths,
    { scope: "workspace" },
  );
  for (const agent of runtime.resolved.agents) {
    const agentPaths = runtime.getAgentPaths(agent.id);
    const visibility: WorkspaceKnowledgeVisibility = {
      scope: "agents",
      agentIds: [agent.id],
    };
    addMarkdownTree(runtime.paths.workspace, agentPaths.skillsDir, paths, visibility);
    addMarkdownTree(runtime.paths.workspace, agentPaths.contextDir, paths, visibility);
    addMarkdownTree(runtime.paths.workspace, agentPaths.vaultDir, paths, visibility);
  }
  return [...paths.entries()]
    .map(([absolutePath, visibility]) => ({ absolutePath, visibility }))
    .sort((a, b) => a.absolutePath.localeCompare(b.absolutePath));
}

function addMarkdownTree(
  workspace: string,
  root: string,
  paths: Map<string, WorkspaceKnowledgeVisibility>,
  visibility: WorkspaceKnowledgeVisibility,
): void {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      addMarkdownTree(workspace, path, paths, visibility);
      continue;
    }
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== ".md") continue;
    if (!relative(workspace, path).startsWith("..")) {
      addCorpusPath(paths, path, visibility);
    }
  }
}

function addCorpusPath(
  paths: Map<string, WorkspaceKnowledgeVisibility>,
  path: string,
  visibility: WorkspaceKnowledgeVisibility,
): void {
  const existing = paths.get(path);
  if (!existing || visibility.scope === "workspace") {
    paths.set(path, visibility);
    return;
  }
  if (existing.scope === "workspace") return;
  paths.set(path, {
    scope: "agents",
    agentIds: [...new Set([...existing.agentIds, ...visibility.agentIds])].sort(),
  });
}

function sameVisibility(
  left: WorkspaceKnowledgeVisibility | undefined,
  right: WorkspaceKnowledgeVisibility | undefined,
): boolean {
  if (!left || !right) return false;
  if (left.scope !== right.scope) return false;
  if (left.scope === "workspace" || right.scope === "workspace") return true;
  return left.agentIds.length === right.agentIds.length &&
    left.agentIds.every((agentId, index) => agentId === right.agentIds[index]);
}

function chunkMarkdownFile(path: string, content: string): WorkspaceSearchChunk[] {
  const lines = content.split(/\r?\n/);
  const chunks: WorkspaceSearchChunk[] = [];
  let headingTrail: string[] = [];
  let currentLines: string[] = [];
  let currentTrail: string[] = [];
  let currentStart = 1;

  const flush = (lineEnd: number) => {
    const text = normalizeWhitespace(currentLines.join("\n"));
    const headingText = currentTrail.join(" > ");
    if (!text && !headingText) return;
    chunks.push({
      id: `${path}#${chunks.length + 1}`,
      path,
      headingTrail: currentTrail,
      lineStart: currentStart,
      lineEnd,
      text: text || headingText,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flush(index);
      const level = heading[1]!.length;
      headingTrail = headingTrail.slice(0, level - 1);
      headingTrail[level - 1] = heading[2]!.replace(/#+$/, "").trim();
      currentTrail = headingTrail.filter(Boolean);
      currentLines = [];
      currentStart = index + 1;
      continue;
    }
    currentLines.push(line);
  }
  flush(lines.length);

  if (chunks.length === 0 && content.trim()) {
    chunks.push({
      id: `${path}#1`,
      path,
      headingTrail: [],
      lineStart: 1,
      lineEnd: lines.length,
      text: normalizeWhitespace(content),
    });
  }

  return chunks;
}

function searchableChunkText(chunk: WorkspaceSearchChunk): string {
  return [
    chunk.path,
    basename(chunk.path),
    chunk.headingTrail.join(" "),
    chunk.text,
  ].join("\n");
}

function snippetForChunk(chunk: WorkspaceSearchChunk, query: string): string {
  const text = chunk.text || chunk.headingTrail.join(" > ") || chunk.path;
  const normalized = normalizeWhitespace(text);
  const queryIndex = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (queryIndex >= 0) return snippetAround(normalized, queryIndex);
  for (const token of tokenize(query)) {
    const tokenIndex = normalized.toLowerCase().indexOf(token);
    if (tokenIndex >= 0) return snippetAround(normalized, tokenIndex);
  }
  return clipSnippet(normalized, MAX_SNIPPET_CHARS);
}

function snippetAround(text: string, index: number): string {
  const half = Math.floor(MAX_SNIPPET_CHARS / 2);
  const start = Math.max(0, index - half);
  const end = Math.min(text.length, start + MAX_SNIPPET_CHARS);
  return `${start > 0 ? "..." : ""}${text.slice(start, end)}${end < text.length ? "..." : ""}`;
}

function clipSnippet(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 32))}... [truncated]`;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_PATTERN) ?? [])
    .filter((token) => token.length > 1);
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function roundScore(score: number): number {
  return Math.round(score * 10000) / 10000;
}

function workspaceSearchIndexPath(runtime: AppRuntime): string {
  return join(runtime.paths.runtimeDir, "search", "workspace-index.json");
}

function loadWorkspaceSearchIndex(path: string): WorkspaceSearchIndex | null {
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!isRecord(raw) || !Array.isArray(raw.files)) return null;
    return raw as unknown as WorkspaceSearchIndex;
  } catch {
    return null;
  }
}

function workspaceEmbeddingModel(runtime: AppRuntime): string {
  return workspaceEmbeddingsEnabled(runtime) ? "unavailable-local-embedding-v1" : "disabled";
}

function workspaceEmbeddingsEnabled(runtime: AppRuntime): boolean {
  const searchConfig = runtime.config.search;
  if (!isRecord(searchConfig)) return false;
  const workspaceConfig = searchConfig.workspace;
  if (!isRecord(workspaceConfig)) return false;
  const embeddings = workspaceConfig.embeddings;
  return isRecord(embeddings) && embeddings.enabled === true;
}

function localSearchHints(): string[] {
  return [
    "Use `shrimpy sessions search <query>` for session transcripts.",
    "Use `shrimpy channels search <channel> <query>` for channel logs.",
  ];
}
