import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import {
  retryAssistantCall,
  type RetryCallbacks,
  type RetryPolicy,
  uuidv7,
} from "@earendil-works/pi-ai";

export interface QuickCallRuntime {
  completeSimple(
    model: Model<Api>,
    context: Context,
    options: SimpleStreamOptions,
  ): Promise<AssistantMessage>;
}

export interface QuickCallInput {
  runtime: QuickCallRuntime;
  model: Model<Api>;
  systemPrompt?: string;
  prompt: string;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  retry?: RetryPolicy;
  retryCallbacks?: RetryCallbacks;
}

export interface QuickCallResult {
  text: string;
  response: AssistantMessage;
}

// Some providers emit an unrequested thinking block even when their model
// metadata says reasoning is disabled. Leave enough room for that block and
// the short protocol response without opting into reasoning ourselves.
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_TIMEOUT_MS = 30_000;

export async function runQuickCall(
  input: QuickCallInput,
): Promise<QuickCallResult> {
  const context: Context = {
    systemPrompt: input.systemPrompt?.trim() ?? "",
    messages: [{
      role: "user",
      content: [{ type: "text", text: input.prompt }],
      timestamp: Date.now(),
    }],
  };
  const signal = withTimeout(input.signal, input.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const options: SimpleStreamOptions = {
    maxTokens: resolveMaxTokens(input.model, input.maxTokens ?? DEFAULT_MAX_TOKENS),
    signal,
    cacheRetention: "none",
    sessionId: uuidv7(),
    reasoning: input.model.reasoning ? "minimal" : undefined,
  };
  const response = await retryAssistantCall(
    () => input.runtime.completeSimple(input.model, context, options),
    input.retry,
    signal,
    input.retryCallbacks,
  );
  if (response.stopReason === "error") {
    throw new Error(response.errorMessage?.trim() ?? "quick call failed");
  }
  return {
    response,
    text: response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim(),
  };
}

function resolveMaxTokens(model: Model<Api>, requested: number): number {
  const bounded = Math.max(1, Math.floor(requested));
  if (
    typeof model.maxTokens !== "number"
    || !Number.isFinite(model.maxTokens)
    || model.maxTokens <= 0
  ) {
    return bounded;
  }
  return Math.min(bounded, model.maxTokens);
}

function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeout = AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs)));
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
