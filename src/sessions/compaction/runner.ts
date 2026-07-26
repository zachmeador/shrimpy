import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
  type ProviderResponse,
  retryAssistantCall,
  type RetryCallbacks,
  type RetryPolicy,
  type SimpleStreamOptions,
  type Usage,
  uuidv7,
} from "@earendil-works/pi-ai";
import {
  convertToLlm,
  serializeConversation,
  type CompactionResult,
  type FileOperations,
} from "@earendil-works/pi-coding-agent";
import {
  compactionAgentContext,
  compactionChunk,
  compactionIntermediate,
  compactionSummary,
  compactionSummarizationSystem,
  compactionTurnPrefix,
  compactionUpdate,
} from "../../instructions/index.js";

type CompactionResponseHandler = (
  response: ProviderResponse,
  model: Model<Api>,
) => void | Promise<void>;

type CompactionComplete = (
  model: Model<Api>,
  context: Context,
  options: SimpleStreamOptions,
) => Promise<AssistantMessage>;

interface ShrimpyCompactionPreparation {
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

interface ShrimpyCompactionOptions {
  customInstructions?: string;
  sessionSystemPrompt?: string;
  signal?: AbortSignal;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  complete: CompactionComplete;
}

interface SerializedChunk {
  text: string;
}

interface SummaryRequestBase {
  model: Model<Api>;
  signal?: AbortSignal;
  sessionSystemPrompt?: string;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  recordUsage: (usage: Usage) => void;
  complete: CompactionComplete;
}

const ESTIMATED_CHARS_PER_TOKEN = 4;
const MIN_COMPACTION_INPUT_TOKENS = 8_000;
const MAX_COMPACTION_INPUT_TOKENS = 60_000;
const PROMPT_OVERHEAD_TOKENS = 4_000;
const CHUNK_SUMMARY_MAX_TOKENS = 4_096;
const MAX_SUMMARY_MERGE_PASSES = 4;

export async function compactSessionHistory(
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
  let totalUsage: Usage | undefined;
  const recordUsage = (usage: Usage) => {
    totalUsage = totalUsage ? combineUsage(totalUsage, usage) : usage;
  };

  let summary: string;
  if (isSplitTurn && turnPrefixMessages.length > 0) {
    const [historyResult, turnPrefixResult] = await Promise.all([
      messagesToSummarize.length > 0
        ? generateSummaryWithHooks({
          messages: messagesToSummarize,
          model,
          reserveTokens: settings.reserveTokens,
          signal: options.signal,
          customInstructions: options.customInstructions,
          sessionSystemPrompt: options.sessionSystemPrompt,
          previousSummary,
          onResponse: options.onResponse,
          retry: options.retry,
          retryCallbacks: options.retryCallbacks,
          recordUsage,
          complete: options.complete,
        })
        : Promise.resolve("No prior history."),
      generateTurnPrefixSummaryWithHooks({
        messages: turnPrefixMessages,
        model,
        reserveTokens: settings.reserveTokens,
        signal: options.signal,
        sessionSystemPrompt: options.sessionSystemPrompt,
        onResponse: options.onResponse,
        retry: options.retry,
        retryCallbacks: options.retryCallbacks,
        recordUsage,
        complete: options.complete,
      }),
    ]);
    summary = `${historyResult}\n\n---\n\n**Turn Context (split turn):**\n\n${turnPrefixResult}`;
  } else {
    summary = await generateSummaryWithHooks({
      messages: messagesToSummarize,
      model,
      reserveTokens: settings.reserveTokens,
      signal: options.signal,
      customInstructions: options.customInstructions,
      sessionSystemPrompt: options.sessionSystemPrompt,
      previousSummary,
      onResponse: options.onResponse,
      retry: options.retry,
      retryCallbacks: options.retryCallbacks,
      recordUsage,
      complete: options.complete,
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
    usage: totalUsage,
    details: { readFiles, modifiedFiles },
  };
}

async function generateSummaryWithHooks(input: {
  messages: AgentMessage[];
  model: Model<Api>;
  reserveTokens: number;
  signal?: AbortSignal;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  previousSummary?: string;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  recordUsage: (usage: Usage) => void;
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
    ...summaryRequestBase(input),
    promptText,
    maxTokens: resolveCompactionMaxTokens(input.model, Math.floor(0.8 * input.reserveTokens)),
    errorPrefix: "Summarization failed",
  });
}

async function generateChunkedSummaryWithHooks(input: {
  messages: AgentMessage[];
  model: Model<Api>;
  reserveTokens: number;
  signal?: AbortSignal;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  previousSummary?: string;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  recordUsage: (usage: Usage) => void;
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
  for (const [index, chunk] of chunks.entries()) {
    const promptText = buildChunkSummaryPrompt(
      chunk.text,
      index + 1,
      chunks.length,
      input.customInstructions,
    );
    chunkSummaries.push(await completeSummaryRequest({
      ...summaryRequestBase(input),
      promptText,
      maxTokens: resolveChunkSummaryMaxTokens(input.model, input.reserveTokens),
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
  signal?: AbortSignal;
  customInstructions?: string;
  sessionSystemPrompt?: string;
  previousSummary?: string;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  recordUsage: (usage: Usage) => void;
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
      ...summaryRequestBase(input),
      promptText,
      maxTokens: resolveCompactionMaxTokens(
        input.model,
        Math.floor(0.8 * input.reserveTokens),
      ),
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
  for (const [index, chunk] of intermediateChunks.entries()) {
    intermediateSummaries.push(await completeSummaryRequest({
      ...summaryRequestBase(input),
      promptText: buildIntermediateSummaryPrompt(
        chunk.text,
        index + 1,
        intermediateChunks.length,
      ),
      maxTokens: resolveChunkSummaryMaxTokens(input.model, input.reserveTokens),
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
    ? compactionUpdate.render({ source: input.source })
    : compactionSummary.render();

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
  return compactionChunk.render({
    chunkText,
    chunkIndex,
    totalChunks,
    customInstructions,
  });
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
  return compactionIntermediate.render({
    chunkSummaryText,
    groupIndex,
    totalGroups,
  });
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
  signal?: AbortSignal;
  sessionSystemPrompt?: string;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  recordUsage: (usage: Usage) => void;
  complete: CompactionComplete;
}): Promise<string> {
  const conversationText = serializeConversation(convertToLlm(input.messages));
  const promptText =
    `<conversation>\n${conversationText}\n</conversation>\n\n${compactionTurnPrefix.render()}`;

  return completeSummaryRequest({
    ...summaryRequestBase(input),
    promptText,
    maxTokens: resolveCompactionMaxTokens(input.model, Math.floor(0.5 * input.reserveTokens)),
    errorPrefix: "Turn prefix summarization failed",
  });
}

function summaryRequestBase(input: SummaryRequestBase): SummaryRequestBase {
  return {
    model: input.model,
    signal: input.signal,
    sessionSystemPrompt: input.sessionSystemPrompt,
    onResponse: input.onResponse,
    retry: input.retry,
    retryCallbacks: input.retryCallbacks,
    recordUsage: input.recordUsage,
    complete: input.complete,
  };
}

async function completeSummaryRequest(input: {
  model: Model<Api>;
  promptText: string;
  maxTokens: number;
  signal?: AbortSignal;
  sessionSystemPrompt?: string;
  onResponse?: CompactionResponseHandler;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
  recordUsage: (usage: Usage) => void;
  complete: CompactionComplete;
  errorPrefix: string;
}): Promise<string> {
  const context: Context = {
    systemPrompt: buildCompactionSystemPrompt(input.sessionSystemPrompt),
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: input.promptText }],
        timestamp: Date.now(),
      },
    ],
  };
  const requestOptions: SimpleStreamOptions = {
    maxTokens: input.maxTokens,
    signal: input.signal,
    cacheRetention: "none",
    sessionId: uuidv7(),
    reasoning: input.model.reasoning ? "high" : undefined,
    onResponse: input.onResponse,
  };
  const response = await retryAssistantCall(
    () => input.complete(input.model, context, requestOptions),
    input.retry,
    input.signal,
    input.retryCallbacks,
  );
  input.recordUsage(response.usage);
  if (response.stopReason === "error") {
    throw new Error(
      `${input.errorPrefix}: ${(response.errorMessage ?? "") || "Unknown error"}`,
    );
  }
  return response.content
    .filter((content) => content.type === "text")
    .map((content) => content.text)
    .join("\n");
}

function combineUsage(first: Usage, second: Usage): Usage {
  return {
    input: first.input + second.input,
    output: first.output + second.output,
    cacheRead: first.cacheRead + second.cacheRead,
    cacheWrite: first.cacheWrite + second.cacheWrite,
    ...(first.cacheWrite1h !== undefined || second.cacheWrite1h !== undefined
      ? { cacheWrite1h: (first.cacheWrite1h ?? 0) + (second.cacheWrite1h ?? 0) }
      : {}),
    ...(first.reasoning !== undefined || second.reasoning !== undefined
      ? { reasoning: (first.reasoning ?? 0) + (second.reasoning ?? 0) }
      : {}),
    totalTokens: first.totalTokens + second.totalTokens,
    cost: {
      input: first.cost.input + second.cost.input,
      output: first.cost.output + second.cost.output,
      cacheRead: first.cost.cacheRead + second.cost.cacheRead,
      cacheWrite: first.cost.cacheWrite + second.cost.cacheWrite,
      total: first.cost.total + second.cost.total,
    },
  };
}

export function buildCompactionSystemPrompt(
  sessionSystemPrompt?: string,
): string {
  const trimmed = sessionSystemPrompt?.trim();
  if (!trimmed) return compactionSummarizationSystem.render();
  return [
    compactionAgentContext.render(),
    "",
    "<session-agent-context>",
    trimmed,
    "</session-agent-context>",
    "",
    compactionSummarizationSystem.render(),
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
