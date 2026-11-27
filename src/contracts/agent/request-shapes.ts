import { arr, bool, int, lit, nul, num, obj, oneOf, type Static, str, union } from "@earendil-works/chord";
import { AnswerEndingSchema, ModelIdSchema } from "./shapes.ts";

/** Token counts and dollar cost reported by a model for one request. */
export const RequestUsageSchema = obj({
  input: num(),
  output: num(),
  cacheRead: num(),
  cacheWrite: num(),
  totalTokens: num(),
  cost: num(),
});
export type RequestUsage = Static<typeof RequestUsageSchema>;

/** How one model request stands: still in flight, or ended with a provider outcome and usage. */
export const RequestOutcomeSchema = union([
  obj({ kind: lit("in_flight") }),
  obj({
    kind: lit("ended"),
    at: num(),
    how: AnswerEndingSchema,
    detail: union([str(), nul()]),
    usage: union([RequestUsageSchema, nul()]),
  }),
]);
export type RequestOutcome = Static<typeof RequestOutcomeSchema>;

/** One model request in a session's list, newest first. */
export const RequestSummarySchema = obj({
  /** Stable request ID: `<taskId>:<attempt>` for a captured request, or `entry:<id>` for an unrecorded fallback. */
  id: str(),
  /** True when captured before the provider call; false when reconstructed from Pi's log without a captured record. */
  captured: bool(),
  /** When the request began (or when the assistant entry was stamped, for an unrecorded fallback), in epoch ms. */
  at: num(),
  /** 1-based attempt number within the generation task. */
  attempt: int(),
  /** Newest transcript entry ID included in the request's context. */
  cutoff: int(),
  /** Committed assistant entry ID for this attempt, or null while in flight or if none was written. */
  assistantEntry: union([int(), nul()]),
  model: ModelIdSchema,
  thinkingLevel: str(),
  estimatedTokens: union([int(), nul()]),
  /** Whether this request followed a blocking compaction. */
  compacted: bool(),
  /** Number of recorded omissions, truncations, or exclusions affecting this request. */
  omissionsCount: int(),
  outcome: RequestOutcomeSchema,
});
export type RequestSummary = Static<typeof RequestSummarySchema>;

/** One page of requests for a session, newest first, with a cursor for older ones. */
export const RequestPageSchema = obj({
  items: arr(RequestSummarySchema),
  /** Pass as `before` to read older requests, or null at the start of the session. */
  before: union([str(), nul()]),
});
export type RequestPage = Static<typeof RequestPageSchema>;

/** One source file or built-in text that contributed to a prompt section. */
export const RequestSourceSchema = obj({
  section: str(),
  path: str(),
  /** Leading hex digest of the file's content as read. */
  sha256: str(),
  bytes: int(),
  mtimeMs: union([num(), nul()]),
  origin: oneOf("shrimpy", "home", "workspace", "shipped"),
  /** True when the agent kept an earlier reading of this file because the latest read could not use it. */
  carriedOver: bool(),
});
export type RequestSource = Static<typeof RequestSourceSchema>;

/** One active system prompt section resolved for the request, with its source revisions when captured. */
export const RequestSectionSchema = obj({
  key: str(),
  text: str(),
  sha256: str(),
  revisionRecorded: bool(),
  sources: arr(RequestSourceSchema),
});
export type RequestSection = Static<typeof RequestSectionSchema>;

/** One tool offered to the model on this request. */
export const RequestToolSchema = obj({
  name: str(),
  description: str(),
  /** JSON-serialized parameter schema offered to the model. */
  parameters: str(),
  /** Name of the extension that provided the tool, or null when unrecorded. */
  extension: union([str(), nul()]),
});
export type RequestTool = Static<typeof RequestToolSchema>;

/** One omission, truncation, or exclusion that shaped what the model received, and why. */
export const RequestOmissionSchema = union([
  obj({ kind: lit("home_file"), file: str(), reason: str(), carriedOver: bool() }),
  obj({
    kind: lit("backlog_cut"),
    entry: int(),
    cut: int(),
    atLeast: bool(),
    budgetChars: int(),
    usedChars: int(),
    clipped: bool(),
  }),
  obj({ kind: lit("breadcrumb_deferred"), entry: int(), deferred: int(), limit: int() }),
  obj({ kind: lit("breadcrumb_truncated"), entry: int(), file: str(), limitChars: int(), originalChars: int() }),
  obj({
    kind: lit("output_truncated"),
    entry: int(),
    source: oneOf("trigger_check", "process_wake", "tool_result"),
    label: str(),
    reason: str(),
  }),
  obj({
    kind: lit("before_head"),
    headEntry: int(),
    headKind: oneOf("compaction", "reset"),
    reason: union([str(), nul()]),
    omittedEntries: int(),
  }),
  obj({
    kind: lit("entry_edited"),
    entry: int(),
    entryKind: str(),
    action: oneOf("omit", "replace"),
    byEntry: int(),
  }),
  obj({ kind: lit("entry_excluded"), entry: int(), entryKind: str(), stopReason: str() }),
  obj({ kind: lit("missing_tool_result"), toolCallId: str(), toolName: str() }),
]);
export type RequestOmission = Static<typeof RequestOmissionSchema>;

/** Compaction thresholds and token budgets in effect for the request. */
export const RequestCompactionBudgetSchema = obj({
  enabled: bool(),
  reserveTokens: int(),
  keepRecentTokens: int(),
  backgroundTokens: int(),
  blockingAt: union([int(), nul()]),
  backgroundAt: union([int(), nul()]),
});
export type RequestCompactionBudget = Static<typeof RequestCompactionBudgetSchema>;

/** Input-level budgets captured for one user entry in the request's active context. */
export const RequestInputBudgetSchema = obj({
  entry: int(),
  source: oneOf("chat", "trigger", "process", "watch", "steer", "other"),
  backlogBudgetChars: union([int(), nul()]),
  backlogUsedChars: union([int(), nul()]),
  breadcrumbsShown: int(),
  breadcrumbsLimit: union([int(), nul()]),
});
export type RequestInputBudget = Static<typeof RequestInputBudgetSchema>;

/** Token, compaction, and input budgets in effect for the request. */
export const RequestBudgetSchema = obj({
  contextWindow: union([int(), nul()]),
  maxTokens: union([int(), nul()]),
  estimatedTokens: union([int(), nul()]),
  actualInputTokens: union([int(), nul()]),
  compaction: union([RequestCompactionBudgetSchema, nul()]),
  inputs: arr(RequestInputBudgetSchema),
});
export type RequestBudget = Static<typeof RequestBudgetSchema>;

/** Curated provider stream options in effect for the request. */
export const RequestStreamOptionsSchema = obj({
  transport: union([str(), nul()]),
  timeoutMs: union([num(), nul()]),
  cacheRetention: union([str(), nul()]),
  maxRetries: union([int(), nul()]),
  deferred: bool(),
});
export type RequestStreamOptions = Static<typeof RequestStreamOptionsSchema>;

/** Effective model identity, source, and runtime settings for the request. */
export const RequestModelSettingsSchema = obj({
  provider: str(),
  id: str(),
  api: union([str(), nul()]),
  name: union([str(), nul()]),
  /** Where the model choice came from: a per-session `/model`, the home's `agent.json`, the folder's default, or unknown. */
  modelSource: oneOf("session", "home", "folder", "unknown"),
  thinkingLevel: str(),
  toolExecution: union([oneOf("parallel", "sequential"), nul()]),
  maxTurns: union([int(), nul()]),
  steeringMode: union([oneOf("all", "one-at-a-time"), nul()]),
  followUpMode: union([oneOf("all", "one-at-a-time"), nul()]),
  streamOptions: union([RequestStreamOptionsSchema, nul()]),
});
export type RequestModelSettings = Static<typeof RequestModelSettingsSchema>;

/** One content block inside a user, assistant, or tool-result message. */
export const RequestContentBlockSchema = union([
  obj({ type: lit("text"), text: str() }),
  obj({ type: lit("thinking"), thinking: str() }),
  obj({ type: lit("image"), mimeType: str() }),
  obj({ type: lit("toolCall"), id: str(), name: str(), args: str() }),
]);
export type RequestContentBlock = Static<typeof RequestContentBlockSchema>;

/** One section patch carried by a positional system message. */
const SectionPatchSchema = obj({ key: str(), value: union([str(), nul()]) });

/** One message in the effective model context sent to the provider (or stored on a raw entry). */
export const RequestMessageSchema = union([
  obj({
    role: lit("system"),
    timestamp: num(),
    content: str(),
    sections: arr(SectionPatchSchema),
    toolsAdded: arr(str()),
    toolsRemoved: arr(str()),
    modifiedByHook: bool(),
  }),
  obj({
    role: lit("user"),
    timestamp: num(),
    blocks: arr(RequestContentBlockSchema),
    modifiedByHook: bool(),
  }),
  obj({
    role: lit("assistant"),
    timestamp: num(),
    blocks: arr(RequestContentBlockSchema),
    model: union([str(), nul()]),
    stopReason: str(),
    modifiedByHook: bool(),
  }),
  obj({
    role: lit("toolResult"),
    timestamp: num(),
    toolCallId: str(),
    toolName: str(),
    isError: bool(),
    blocks: arr(RequestContentBlockSchema),
    /** True when Pi synthesized a missing_result message because history ended before the call completed. */
    synthesized: bool(),
    modifiedByHook: bool(),
  }),
]);
export type RequestMessage = Static<typeof RequestMessageSchema>;

/** One raw active transcript entry scanned for this request, and how it contributed to the model context. */
export const RequestRawEntrySchema = obj({
  id: int(),
  kind: str(),
  head: union([int(), nul()]),
  editsCount: int(),
  status: oneOf("included", "omitted_by_edit", "replaced_by_edit", "excluded_stop_reason", "display_only"),
  statusDetail: union([str(), nul()]),
  modelMessages: arr(RequestMessageSchema),
  contributedCount: int(),
});
export type RequestRawEntry = Static<typeof RequestRawEntrySchema>;

/** Full reconstructed view of what the model received for one request, and why. */
export const SessionRequestSchema = obj({
  summary: RequestSummarySchema,
  settings: RequestModelSettingsSchema,
  budget: RequestBudgetSchema,
  sections: arr(RequestSectionSchema),
  tools: arr(RequestToolSchema),
  deferredTools: arr(str()),
  omissions: arr(RequestOmissionSchema),
  rawEntries: arr(RequestRawEntrySchema),
  effectiveMessages: arr(RequestMessageSchema),
});
export type SessionRequest = Static<typeof SessionRequestSchema>;
