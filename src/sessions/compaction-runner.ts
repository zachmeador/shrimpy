import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  completeSimple,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type ProviderResponse,
  type ThinkingLevel,
} from "@earendil-works/pi-ai";
import {
  convertToLlm,
  serializeConversation,
  type CompactionResult,
  type FileOperations,
} from "@earendil-works/pi-coding-agent";
import {
  COMPACTION_AGENT_CONTEXT_PROMPT,
  COMPACTION_SUMMARY_PROMPT,
  COMPACTION_SUMMARIZATION_SYSTEM_PROMPT,
  COMPACTION_TURN_PREFIX_SUMMARY_PROMPT,
  COMPACTION_UPDATE_SUMMARY_PROMPT,
} from "../context/system/compaction.js";
import {
  INFERENCE_PARAM_NAMES,
  type InferenceParamName,
  type ModelVariantInference,
} from "../inference/params.js";

export type CompactionPayloadTransform = (
  payload: unknown,
  model: Model<Api>,
) => unknown | undefined | Promise<unknown | undefined>;

export type CompactionResponseHandler = (
  response: ProviderResponse,
  model: Model<Api>,
) => void | Promise<void>;

export type CompactionComplete = (
  model: Model<Api>,
  context: Context,
  options: {
    maxTokens: number;
    signal?: AbortSignal;
    apiKey: string;
    headers?: Record<string, string>;
    reasoning?: ThinkingLevel;
    onPayload?: CompactionPayloadTransform;
    onResponse?: CompactionResponseHandler;
  },
) => Promise<AssistantMessage>;

export interface ShrimpyCompactionPreparation {
  firstKeptEntryId: string;
  messagesToSummarize: AgentMessage[];
  turnPrefixMessages: AgentMessage[];
  isSplitTurn: boolean;
  tokensBefore: number;
  previousSummary?: string;
  fileOps: FileOperations;
  settings: {
    reserveTokens: number;
  };
}

export interface ShrimpyCompactionOptions {
  apiKey: string;
  headers?: Record<string, string>;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  signal?: AbortSignal;
  onPayload?: CompactionPayloadTransform;
  onResponse?: CompactionResponseHandler;
  complete?: CompactionComplete;
}

interface SerializedChunk {
  text: string;
}

const ESTIMATED_CHARS_PER_TOKEN = 4;
const MIN_COMPACTION_INPUT_TOKENS = 8_000;
const MAX_COMPACTION_INPUT_TOKENS = 60_000;
const PROMPT_OVERHEAD_TOKENS = 4_000;
const CHUNK_SUMMARY_MAX_TOKENS = 4_096;
const MAX_SUMMARY_MERGE_PASSES = 4;

export async function compactWithProviderRequestHooks(
  preparation: ShrimpyCompactionPreparation,
  model: Model<Api>,
  options: ShrimpyCompactionOptions,
): Promise<CompactionResult> {
  const {
    firstKeptEntryId,
    messagesToSummarize,
    turnPrefixMessages,
    isSplitTurn,
    tokensBefore,
    previousSummary,
    fileOps,
    settings,
  } = preparation;
  const complete = options.complete ?? completeSimple;

  let summary: string;
  if (isSplitTurn && turnPrefixMessages.length > 0) {
    const [historyResult, turnPrefixResult] = await Promise.all([
      messagesToSummarize.length > 0
        ? generateSummaryWithHooks({
          messages: messagesToSummarize,
          model,
          reserveTokens: settings.reserveTokens,
          apiKey: options.apiKey,
          headers: options.headers,
          signal: options.signal,
          customInstructions: options.customInstructions,
          sessionSystemPrompt: options.sessionSystemPrompt,
          previousSummary,
          onPayload: options.onPayload,
          onResponse: options.onResponse,
          complete,
        })
        : Promise.resolve("No prior history."),
      generateTurnPrefixSummaryWithHooks({
        messages: turnPrefixMessages,
        model,
        reserveTokens: settings.reserveTokens,
        apiKey: options.apiKey,
        headers: options.headers,
        signal: options.signal,
        sessionSystemPrompt: options.sessionSystemPrompt,
        onPayload: options.onPayload,
        onResponse: options.onResponse,
        complete,
      }),
    ]);
    summary = `${historyResult}\n\n---\n\n**Turn Context (split turn):**\n\n${turnPrefixResult}`;
  } else {
    summary = await generateSummaryWithHooks({
      messages: messagesToSummarize,
      model,
      reserveTokens: settings.reserveTokens,
      apiKey: options.apiKey,
      headers: options.headers,
      signal: options.signal,
      customInstructions: options.customInstructions,
      sessionSystemPrompt: options.sessionSystemPrompt,
      previousSummary,
      onPayload: options.onPayload,
      onResponse: options.onResponse,
      complete,
    });
  }

  const { readFiles, modifiedFiles } = computeFileLists(fileOps);
  summary += formatFileOperations(readFiles, modifiedFiles);

  if (!firstKeptEntryId) {
    throw new Error("First kept entry has no UUID - session may need migration");
  }

  return {
    summary,
    firstKeptEntryId,
    tokensBefore,
    details: { readFiles, modifiedFiles },
  };
}

export function readShrimpySessionInference(
  branchEntries: unknown[],
): ModelVariantInference | undefined {
  for (let index = branchEntries.length - 1; index >= 0; index--) {
    const entry = branchEntries[index];
    if (!isRecord(entry)) continue;
    if (entry.type !== "custom") continue;
    if (entry.customType !== "shrimpy_session_metadata") continue;
    if (!isRecord(entry.data)) continue;
    return parseModelVariantInference(entry.data.inference);
  }
  return undefined;
}

async function generateSummaryWithHooks(input: {
  messages: AgentMessage[];
  model: Model<Api>;
  reserveTokens: number;
  apiKey: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  previousSummary?: string;
  onPayload?: CompactionPayloadTransform;
  onResponse?: CompactionResponseHandler;
  complete: CompactionComplete;
}): Promise<string> {
  const basePrompt = buildSummaryPrompt({
    previousSummary: input.previousSummary,
    customInstructions: input.customInstructions,
    source: "messages",
  });

  const conversationText = serializeConversation(convertToLlm(input.messages));
  const promptText = buildConversationSummaryPrompt(
    conversationText,
    input.previousSummary,
    basePrompt,
  );
  const inputTokenBudget = resolveCompactionInputTokenBudget(input.model);

  if (estimateCompactionRequestTokens(promptText, input.sessionSystemPrompt) > inputTokenBudget) {
    return generateChunkedSummaryWithHooks(input);
  }

  return completeSummaryRequest({
    model: input.model,
    promptText,
    maxTokens: resolveCompactionMaxTokens(input.model, Math.floor(0.8 * input.reserveTokens)),
    apiKey: input.apiKey,
    headers: input.headers,
    signal: input.signal,
    sessionSystemPrompt: input.sessionSystemPrompt,
    onPayload: input.onPayload,
    onResponse: input.onResponse,
    complete: input.complete,
    errorPrefix: "Summarization failed",
  });
}

async function generateChunkedSummaryWithHooks(input: {
  messages: AgentMessage[];
  model: Model<Api>;
  reserveTokens: number;
  apiKey: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  previousSummary?: string;
  onPayload?: CompactionPayloadTransform;
  onResponse?: CompactionResponseHandler;
  complete: CompactionComplete;
}): Promise<string> {
  const chunks = chunkConversationMessages(
    input.messages,
    resolveChunkContentTokenBudget(input.model, input.sessionSystemPrompt),
  );
  if (chunks.length === 0) {
    return mergeChunkSummariesWithHooks({
      ...input,
      chunkSummaries: ["No new serializable conversation content."],
      pass: 0,
    });
  }

  const chunkSummaries: string[] = [];
  for (let index = 0; index < chunks.length; index++) {
    const promptText = buildChunkSummaryPrompt(
      chunks[index].text,
      index + 1,
      chunks.length,
      input.customInstructions,
    );
    chunkSummaries.push(await completeSummaryRequest({
      model: input.model,
      promptText,
      maxTokens: resolveChunkSummaryMaxTokens(input.model, input.reserveTokens),
      apiKey: input.apiKey,
      headers: input.headers,
      signal: input.signal,
      sessionSystemPrompt: input.sessionSystemPrompt,
      onPayload: input.onPayload,
      onResponse: input.onResponse,
      complete: input.complete,
      errorPrefix: "Summarization failed",
    }));
  }

  return mergeChunkSummariesWithHooks({
    ...input,
    chunkSummaries,
    pass: 0,
  });
}

async function mergeChunkSummariesWithHooks(input: {
  chunkSummaries: string[];
  model: Model<Api>;
  reserveTokens: number;
  apiKey: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  previousSummary?: string;
  onPayload?: CompactionPayloadTransform;
  onResponse?: CompactionResponseHandler;
  complete: CompactionComplete;
  pass: number;
}): Promise<string> {
  const promptText = buildChunkSummaryMergePrompt(
    input.chunkSummaries,
    input.previousSummary,
    input.customInstructions,
  );
  const inputTokenBudget = resolveCompactionInputTokenBudget(input.model);

  if (
    estimateCompactionRequestTokens(promptText, input.sessionSystemPrompt) <= inputTokenBudget
    || input.chunkSummaries.length <= 1
  ) {
    return completeSummaryRequest({
      model: input.model,
      promptText,
      maxTokens: resolveCompactionMaxTokens(
        input.model,
        Math.floor(0.8 * input.reserveTokens),
      ),
      apiKey: input.apiKey,
      headers: input.headers,
      signal: input.signal,
      sessionSystemPrompt: input.sessionSystemPrompt,
      onPayload: input.onPayload,
      onResponse: input.onResponse,
      complete: input.complete,
      errorPrefix: "Summarization failed",
    });
  }

  if (input.pass >= MAX_SUMMARY_MERGE_PASSES) {
    throw new Error("Summarization failed: chunk summaries remained too large to merge");
  }

  const intermediateChunks = chunkTextBlocks(
    input.chunkSummaries.map((summary, index) => ({
      text: `[Chunk ${index + 1}/${input.chunkSummaries.length}]\n${summary}`,
    })),
    resolveChunkContentTokenBudget(input.model, input.sessionSystemPrompt),
  );
  const intermediateSummaries: string[] = [];
  for (let index = 0; index < intermediateChunks.length; index++) {
    intermediateSummaries.push(await completeSummaryRequest({
      model: input.model,
      promptText: buildIntermediateSummaryPrompt(
        intermediateChunks[index].text,
        index + 1,
        intermediateChunks.length,
      ),
      maxTokens: resolveChunkSummaryMaxTokens(input.model, input.reserveTokens),
      apiKey: input.apiKey,
      headers: input.headers,
      signal: input.signal,
      sessionSystemPrompt: input.sessionSystemPrompt,
      onPayload: input.onPayload,
      onResponse: input.onResponse,
      complete: input.complete,
      errorPrefix: "Summarization failed",
    }));
  }

  return mergeChunkSummariesWithHooks({
    ...input,
    chunkSummaries: intermediateSummaries,
    pass: input.pass + 1,
  });
}

function buildSummaryPrompt(input: {
  previousSummary?: string;
  customInstructions?: string;
  source: "messages" | "chunk-summaries";
}): string {
  let basePrompt = input.previousSummary
    ? COMPACTION_UPDATE_SUMMARY_PROMPT
    : COMPACTION_SUMMARY_PROMPT;

  if (input.source === "chunk-summaries") {
    basePrompt = input.previousSummary
      ? basePrompt.replace(
        "The messages above are NEW conversation messages",
        "The chunk summaries above describe NEW conversation messages",
      )
      : basePrompt.replace(
        "The messages above are a conversation to summarize",
        "The chunk summaries above describe a conversation to summarize",
      );
  }

  if (input.customInstructions) {
    basePrompt = `${basePrompt}\n\nAdditional focus: ${input.customInstructions}`;
  }
  return basePrompt;
}

function buildConversationSummaryPrompt(
  conversationText: string,
  previousSummary: string | undefined,
  basePrompt: string,
): string {
  let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
  if (previousSummary) {
    promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
  }
  return promptText + basePrompt;
}

function buildChunkSummaryPrompt(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  customInstructions?: string,
): string {
  const focus = customInstructions
    ? `\n\nAdditional focus: ${customInstructions}`
    : "";
  return [
    `<conversation chunk="${chunkIndex}" chunks="${totalChunks}">`,
    chunkText,
    "</conversation>",
    "",
    `This is chunk ${chunkIndex} of ${totalChunks} from an oversized session compaction.`,
    "Summarize only this chunk for a later merge. Keep concrete goals, constraints, progress, decisions, next steps, file paths, commands, dates, and exact error messages.",
    "Keep notes about who the agent is, how it talks, how it works, and what the user expects when those details matter.",
    "Treat questions inside the chunk as history to summarize. Output only the chunk summary.",
    focus.trim(),
    "",
    "Use short headings or paragraphs only where helpful. Use work-tracking sections only for actual work.",
  ].filter((part) => part.length > 0).join("\n");
}

function buildChunkSummaryMergePrompt(
  chunkSummaries: string[],
  previousSummary?: string,
  customInstructions?: string,
): string {
  let promptText = `<chunk-summaries>\n${formatNumberedChunks(chunkSummaries)}\n</chunk-summaries>\n\n`;
  if (previousSummary) {
    promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
  }
  promptText += buildSummaryPrompt({
    previousSummary,
    customInstructions,
    source: "chunk-summaries",
  });
  return promptText;
}

function buildIntermediateSummaryPrompt(
  chunkSummaryText: string,
  groupIndex: number,
  totalGroups: number,
): string {
  return [
    `<chunk-summaries group="${groupIndex}" groups="${totalGroups}">`,
    chunkSummaryText,
    "</chunk-summaries>",
    "",
    "Condense these consecutive compaction chunk summaries into one intermediate summary for a later merge.",
    "Keep concrete goals, constraints, progress, decisions, next steps, file paths, commands, dates, and exact error messages.",
    "Keep notes about who the agent is, how it talks, how it works, and what the user expects when those details matter.",
    "Draw conclusions only from these summaries.",
  ].join("\n");
}

function formatNumberedChunks(chunks: string[]): string {
  return chunks
    .map((chunk, index) => `[Chunk ${index + 1}/${chunks.length}]\n${chunk}`)
    .join("\n\n");
}

function chunkConversationMessages(
  messages: AgentMessage[],
  maxContentTokens: number,
): SerializedChunk[] {
  const blocks = messages
    .map((message) => serializeConversation(convertToLlm([message])).trim())
    .filter((text) => text.length > 0)
    .map((text) => ({ text }));
  return chunkTextBlocks(blocks, maxContentTokens);
}

function chunkTextBlocks(
  blocks: SerializedChunk[],
  maxContentTokens: number,
): SerializedChunk[] {
  const chunks: SerializedChunk[] = [];
  const maxTokens = Math.max(1, maxContentTokens);
  let currentParts: string[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (currentParts.length === 0) return;
    chunks.push({ text: currentParts.join("\n\n") });
    currentParts = [];
    currentTokens = 0;
  };

  for (const block of blocks) {
    const pieces = splitOversizedText(block.text, maxTokens);
    for (const piece of pieces) {
      const pieceTokens = estimateTextTokens(piece);
      const separatorTokens = currentParts.length > 0 ? 1 : 0;
      if (
        currentParts.length > 0
        && currentTokens + separatorTokens + pieceTokens > maxTokens
      ) {
        flush();
      }
      currentParts.push(piece);
      currentTokens += separatorTokens + pieceTokens;
    }
  }

  flush();
  return chunks;
}

function splitOversizedText(text: string, maxTokens: number): string[] {
  if (estimateTextTokens(text) <= maxTokens) return [text];

  const maxChars = Math.max(1_000, maxTokens * ESTIMATED_CHARS_PER_TOKEN);
  const pieces: string[] = [];
  let remaining = text;

  while (remaining.length > maxChars) {
    let cutAt = remaining.lastIndexOf("\n\n", maxChars);
    if (cutAt < Math.floor(maxChars * 0.5)) {
      cutAt = remaining.lastIndexOf("\n", maxChars);
    }
    if (cutAt < Math.floor(maxChars * 0.5)) {
      cutAt = maxChars;
    }

    pieces.push(`${remaining.slice(0, cutAt).trimEnd()}\n\n[continued in next compaction chunk]`);
    remaining = `[continued from previous compaction chunk]\n\n${remaining.slice(cutAt).trimStart()}`;
  }

  if (remaining.trim().length > 0) {
    pieces.push(remaining);
  }
  return pieces;
}

function resolveCompactionInputTokenBudget(model: Model<Api>): number {
  const contextWindow = typeof model.contextWindow === "number" && Number.isFinite(model.contextWindow)
    ? model.contextWindow
    : undefined;
  if (contextWindow === undefined || contextWindow <= 0) {
    return MAX_COMPACTION_INPUT_TOKENS;
  }
  return Math.max(
    MIN_COMPACTION_INPUT_TOKENS,
    Math.min(MAX_COMPACTION_INPUT_TOKENS, Math.floor(contextWindow * 0.4)),
  );
}

function resolveChunkContentTokenBudget(
  model: Model<Api>,
  sessionSystemPrompt?: string,
): number {
  return Math.max(
    1_000,
    resolveCompactionInputTokenBudget(model)
      - PROMPT_OVERHEAD_TOKENS
      - estimateTextTokens(buildCompactionSystemPrompt(sessionSystemPrompt)),
  );
}

function resolveChunkSummaryMaxTokens(
  model: Model<Api>,
  reserveTokens: number,
): number {
  return resolveCompactionMaxTokens(
    model,
    Math.min(CHUNK_SUMMARY_MAX_TOKENS, Math.max(512, Math.floor(0.4 * reserveTokens))),
  );
}

function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN);
}

function generateTurnPrefixSummaryWithHooks(input: {
  messages: AgentMessage[];
  model: Model<Api>;
  reserveTokens: number;
  apiKey: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  sessionSystemPrompt?: string;
  onPayload?: CompactionPayloadTransform;
  onResponse?: CompactionResponseHandler;
  complete: CompactionComplete;
}): Promise<string> {
  const conversationText = serializeConversation(convertToLlm(input.messages));
  const promptText =
    `<conversation>\n${conversationText}\n</conversation>\n\n${COMPACTION_TURN_PREFIX_SUMMARY_PROMPT}`;

  return completeSummaryRequest({
    model: input.model,
    promptText,
    maxTokens: resolveCompactionMaxTokens(input.model, Math.floor(0.5 * input.reserveTokens)),
    apiKey: input.apiKey,
    headers: input.headers,
    signal: input.signal,
    sessionSystemPrompt: input.sessionSystemPrompt,
    onPayload: input.onPayload,
    onResponse: input.onResponse,
    complete: input.complete,
    errorPrefix: "Turn prefix summarization failed",
  });
}

async function completeSummaryRequest(input: {
  model: Model<Api>;
  promptText: string;
  maxTokens: number;
  apiKey: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  sessionSystemPrompt?: string;
  onPayload?: CompactionPayloadTransform;
  onResponse?: CompactionResponseHandler;
  complete: CompactionComplete;
  errorPrefix: string;
}): Promise<string> {
  const response = await input.complete(
    input.model,
    {
      systemPrompt: buildCompactionSystemPrompt(input.sessionSystemPrompt),
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: input.promptText }],
          timestamp: Date.now(),
        },
      ],
    },
    {
      maxTokens: input.maxTokens,
      signal: input.signal,
      apiKey: input.apiKey,
      headers: input.headers,
      reasoning: input.model.reasoning ? "high" : undefined,
      onPayload: input.onPayload,
      onResponse: input.onResponse,
    },
  );
  if (response.stopReason === "error") {
    throw new Error(`${input.errorPrefix}: ${response.errorMessage || "Unknown error"}`);
  }
  return response.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");
}

export function buildCompactionSystemPrompt(
  sessionSystemPrompt?: string,
): string {
  const trimmed = sessionSystemPrompt?.trim();
  if (!trimmed) return COMPACTION_SUMMARIZATION_SYSTEM_PROMPT;
  return [
    COMPACTION_AGENT_CONTEXT_PROMPT,
    "",
    "<session-agent-context>",
    trimmed,
    "</session-agent-context>",
    "",
    COMPACTION_SUMMARIZATION_SYSTEM_PROMPT,
  ].join("\n");
}

function estimateCompactionRequestTokens(
  promptText: string,
  sessionSystemPrompt?: string,
): number {
  return estimateTextTokens(promptText)
    + estimateTextTokens(buildCompactionSystemPrompt(sessionSystemPrompt));
}

export function resolveCompactionMaxTokens(
  model: Model<Api>,
  requestedMaxTokens: number,
): number {
  const modelMaxTokens = typeof model.maxTokens === "number" && Number.isFinite(model.maxTokens)
    ? model.maxTokens
    : undefined;
  if (modelMaxTokens === undefined || modelMaxTokens <= 0) return requestedMaxTokens;
  return Math.min(requestedMaxTokens, modelMaxTokens);
}

function computeFileLists(fileOps: FileOperations): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readFiles = [...fileOps.read].filter((file) => !modified.has(file)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles, modifiedFiles };
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const sections: string[] = [];
  if (readFiles.length > 0) {
    sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
  }
  if (modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
  }
  return sections.length > 0 ? `\n\n${sections.join("\n\n")}` : "";
}

function parseModelVariantInference(value: unknown): ModelVariantInference | undefined {
  if (!isRecord(value)) return undefined;

  const baseModel = value.baseModel;
  const enableThinking = value.enableThinking;
  const params = value.params;
  if (baseModel !== undefined && typeof baseModel !== "string") return undefined;
  if (enableThinking !== undefined && typeof enableThinking !== "boolean") return undefined;
  if (params !== undefined && !isRecord(params)) return undefined;

  const parsedParams: Partial<Record<InferenceParamName, number>> = {};
  if (isRecord(params)) {
    for (const name of INFERENCE_PARAM_NAMES) {
      const param = params[name];
      if (param === undefined) continue;
      if (typeof param !== "number" || !Number.isFinite(param)) return undefined;
      parsedParams[name] = param;
    }
  }

  return {
    baseModel,
    enableThinking,
    params: parsedParams,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
