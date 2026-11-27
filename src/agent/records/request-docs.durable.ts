import type { JsonValue } from "@earendil-works/chord/json";
import { defineDoc, defineDocFamily } from "@earendil-works/pi-durable";
import type {
  RequestCompactionBudget,
  RequestOutcome,
  RequestStreamOptions,
} from "../../contracts/agent/index.ts";
import type { InputProvenance } from "../inputs/index.ts";

/** One source file or built-in text revision, stored deduplicated under `ContextRevisionsDoc`. */
export type StoredSourceRevision = {
  path: string;
  sha256: string;
  bytes: number;
  mtimeMs: number | null;
  origin: "shrimpy" | "home" | "workspace" | "shipped";
  carriedOver: boolean;
};

/** Stored provenance for one distinct rendered prompt section hash. */
export type StoredSectionRevision = {
  key: string;
  sha256: string;
  sources: StoredSourceRevision[];
};

/**
 * Deduplicated map of prompt section source revisions, keyed by `<sectionKey>:<sha256>`,
 * so repeated requests using unchanged home files store their source metadata once.
 */
export const ContextRevisionsDoc = defineDoc<{ sections: Record<string, StoredSectionRevision> }>({
  kind: "shrimpy.context-revisions",
  version: 1,
  scope: "session",
  initial: () => ({ sections: {} }),
  checkpointWhen: () => false,
});

/**
 * Exact delta applied by `beforeRequest` hooks on top of `conversation.context({ at: cutoff }).messages`.
 * Uses sparse per-index replacements when message count is unchanged (0 bytes when no hook changed anything,
 * 1 message when `compactionNoteHook` appends its reminder) and falls back to a full list if a hook
 * inserts, removes, or reorders messages.
 */
export type StoredHookDelta =
  | { kind: "replace"; entries: { index: number; message: JsonValue }[] }
  | { kind: "full"; messages: JsonValue[] };

/** One home file left out (or carried over from an earlier reading) when a request was prepared. */
export type StoredHomeOmission = {
  file: string;
  reason: string;
  carriedOver: boolean;
};

/** Lightweight summary kept in `RequestsIndexDoc` for listing and pagination. */
export type StoredRequestSummary = {
  id: string;
  taskId: number;
  attempt: number;
  at: number;
  cutoff: number;
  compacted: boolean;
  model: { provider: string; id: string };
  thinkingLevel: string;
  estimatedTokens: number;
  omissionsCount: number;
  outcome: RequestOutcome;
};

/** Per-conversation index of captured model requests, oldest first. */
export const RequestsIndexDoc = defineDoc<{ items: StoredRequestSummary[] }>({
  kind: "shrimpy.requests",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "current",
  initial: () => ({ items: [] }),
  checkpointWhen: () => false,
});

/** Small per-request metadata delta paired with `conversation.context({ at: cutoff })` on read. */
export type StoredRequestDetail = {
  id: string;
  taskId: number;
  attempt: number;
  at: number;
  cutoff: number;
  compacted: boolean;
  model: {
    provider: string;
    id: string;
    api: string | null;
    name: string | null;
    contextWindow: number | null;
    maxTokens: number | null;
  };
  modelSource: "session" | "home" | "folder" | "unknown";
  thinkingLevel: string;
  toolExecution: "parallel" | "sequential" | null;
  maxTurns: number | null;
  steeringMode: "all" | "one-at-a-time" | null;
  followUpMode: "all" | "one-at-a-time" | null;
  streamOptions: RequestStreamOptions;
  compaction: RequestCompactionBudget;
  estimatedTokens: number;
  /** Active section key -> `<sectionKey>:<sha256>` lookup key into `ContextRevisionsDoc`. */
  sectionRevisions: Record<string, string>;
  homeLeftOut: StoredHomeOmission[];
  /** Offered tool name -> extension name. */
  toolExtensions: Record<string, string>;
  deferredTools: string[];
  hookDeltas?: StoredHookDelta;
  outcome: RequestOutcome;
};

/** Per-request captured metadata record, keyed by `<taskId>:<attempt>`. */
export const RequestDetailDoc = defineDocFamily<StoredRequestDetail, StoredRequestDetail>({
  kind: "shrimpy.request",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  family: true,
  initial: (seed) => seed,
  checkpointWhen: () => false,
});

/**
 * Input budgets and omissions captured at admission (`takeUp`), indexed by
 * submission request ID until placed and then promoted to transcript entry ID
 * when captured by a request.
 */
export const InputFactsDoc = defineDoc<{
  byRequest: Record<string, InputProvenance>;
  byEntry: Record<string, InputProvenance>;
}>({
  kind: "shrimpy.input-facts",
  version: 1,
  scope: "conversation",
  history: "latest",
  fork: "initial",
  initial: () => ({ byRequest: {}, byEntry: {} }),
  checkpointWhen: () => false,
});
