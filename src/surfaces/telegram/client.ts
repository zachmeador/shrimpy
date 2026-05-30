/**
 * Telegram Bot API client and shared transport types.
 *
 * Pure HTTP: getUpdates, sendMessage, setMyCommands, getFile, downloadFile.
 * Long-polling and update fan-out live in poller.ts; channel translation
 * lives in bridge.ts.
 */

// --- Config ---

export interface TelegramConfig {
  token: string;
}

export interface TelegramBackoffPolicy {
  initialMs: number;
  maxMs: number;
  factor: number;
  jitter: number;
}

export interface TelegramStallDetectionPolicy {
  thresholdMs: number;
  watchdogIntervalMs: number;
}

export interface TelegramPolicy {
  sendMaxRetries: number;
  pollTimeoutSec: number;
  backoff: TelegramBackoffPolicy;
  stallDetection: TelegramStallDetectionPolicy;
}

export interface TelegramPolicyOverrides {
  sendMaxRetries?: number;
  pollTimeoutSec?: number;
  backoff?: Partial<TelegramBackoffPolicy>;
  stallDetection?: Partial<TelegramStallDetectionPolicy>;
}

// --- Error classification (from openclaw network-errors.ts) ---

const RECOVERABLE_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ETIMEDOUT",
  "ESOCKETTIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_ABORTED",
  "ECONNABORTED",
]);

const PRE_CONNECT_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
]);

export function isRecoverableError(err: unknown): boolean {
  if (err instanceof TelegramApiError) {
    return err.recoverable;
  }
  if (!(err instanceof Error)) return false;
  const code = "code" in err && typeof err.code === "string" ? err.code : undefined;
  if (code && RECOVERABLE_ERROR_CODES.has(code)) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("network error") ||
    msg.includes("socket hang up") ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  );
}

export function isSafeToRetrySend(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = "code" in err && typeof err.code === "string" ? err.code : undefined;
  return !!code && PRE_CONNECT_ERROR_CODES.has(code);
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return err.name === "AbortError";
  }
  if (!(err instanceof Error)) return false;
  const code = "code" in err ? err.code : undefined;
  return err.name === "AbortError" || code === "ABORT_ERR";
}

// --- Backoff (from openclaw polling-session.ts) ---

const DEFAULT_TELEGRAM_POLICY: TelegramPolicy = {
  sendMaxRetries: 3,
  pollTimeoutSec: 30,
  backoff: {
    initialMs: 2000,
    maxMs: 30_000,
    factor: 1.8,
    jitter: 0.25,
  },
  stallDetection: {
    thresholdMs: 90_000,
    watchdogIntervalMs: 30_000,
  },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveInt(
  value: unknown,
  key: string,
  min = 1,
): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value) || !Number.isInteger(value) || value < min) {
    throw new Error(`${key} must be an integer >= ${min}`);
  }
  return value;
}

function positiveNumber(
  value: unknown,
  key: string,
  minExclusive = 0,
): number | undefined {
  if (value === undefined) return undefined;
  if (!isFiniteNumber(value) || !(value > minExclusive)) {
    throw new Error(`${key} must be > ${minExclusive}`);
  }
  return value;
}

export function resolveTelegramPolicy(
  overrides?: TelegramPolicyOverrides,
): TelegramPolicy {
  const sendMaxRetries = positiveInt(
    overrides?.sendMaxRetries,
    "telegram.policy.sendMaxRetries",
    0,
  ) ?? DEFAULT_TELEGRAM_POLICY.sendMaxRetries;

  const pollTimeoutSec = positiveInt(
    overrides?.pollTimeoutSec,
    "telegram.policy.pollTimeoutSec",
    1,
  ) ?? DEFAULT_TELEGRAM_POLICY.pollTimeoutSec;

  const initialMs = positiveInt(
    overrides?.backoff?.initialMs,
    "telegram.policy.backoff.initialMs",
    1,
  ) ?? DEFAULT_TELEGRAM_POLICY.backoff.initialMs;

  const maxMs = positiveInt(
    overrides?.backoff?.maxMs,
    "telegram.policy.backoff.maxMs",
    1,
  ) ?? DEFAULT_TELEGRAM_POLICY.backoff.maxMs;

  const factor = positiveNumber(
    overrides?.backoff?.factor,
    "telegram.policy.backoff.factor",
    0,
  ) ?? DEFAULT_TELEGRAM_POLICY.backoff.factor;

  const jitter = overrides?.backoff?.jitter ?? DEFAULT_TELEGRAM_POLICY.backoff.jitter;
  if (!isFiniteNumber(jitter) || jitter < 0 || jitter > 1) {
    throw new Error("telegram.policy.backoff.jitter must be between 0 and 1");
  }

  if (maxMs < initialMs) {
    throw new Error(
      "telegram.policy.backoff.maxMs must be >= telegram.policy.backoff.initialMs",
    );
  }

  const thresholdMs = positiveInt(
    overrides?.stallDetection?.thresholdMs,
    "telegram.policy.stallDetection.thresholdMs",
    1,
  ) ?? DEFAULT_TELEGRAM_POLICY.stallDetection.thresholdMs;

  const watchdogIntervalMs = positiveInt(
    overrides?.stallDetection?.watchdogIntervalMs,
    "telegram.policy.stallDetection.watchdogIntervalMs",
    1,
  ) ?? DEFAULT_TELEGRAM_POLICY.stallDetection.watchdogIntervalMs;

  return {
    sendMaxRetries,
    pollTimeoutSec,
    backoff: {
      initialMs,
      maxMs,
      factor,
      jitter,
    },
    stallDetection: {
      thresholdMs,
      watchdogIntervalMs,
    },
  };
}

// --- Telegram API types ---

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
}

interface TelegramFileAttachment {
  file_id: string;
  file_unique_id?: string;
  file_name?: string;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: { id: number; first_name: string; username?: string };
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  document?: TelegramFileAttachment;
  audio?: TelegramFileAttachment;
  voice?: TelegramFileAttachment;
  video?: TelegramFileAttachment;
  animation?: TelegramFileAttachment;
  sticker?: TelegramFileAttachment;
  location?: { latitude: number; longitude: number };
  contact?: { phone_number: string; first_name: string; last_name?: string; user_id?: number };
  media_group_id?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramFile {
  file_id: string;
  file_path?: string;
}

export interface TelegramBotCommand {
  command: string;
  description: string;
}

interface TelegramApiErrorParameters {
  retry_after?: number;
}

interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: TelegramApiErrorParameters;
}

export class TelegramApiError extends Error {
  readonly method: string;
  readonly errorCode?: number;
  readonly retryAfterMs?: number;
  readonly recoverable: boolean;

  constructor(method: string, resp: TelegramApiResponse<unknown>) {
    super(`${method} failed: ${JSON.stringify(resp)}`);
    this.name = "TelegramApiError";
    this.method = method;
    this.errorCode = resp.error_code;
    this.retryAfterMs = resp.parameters?.retry_after
      ? resp.parameters.retry_after * 1000
      : undefined;
    this.recoverable = method === "getUpdates" && (
      this.errorCode === 429 ||
      (this.errorCode !== undefined && this.errorCode >= 500)
    );
  }
}

export interface TelegramSendMessageOptions {
  parseMode?: string;
  signal?: AbortSignal;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };

    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function computeBackoff(policy: TelegramPolicy, attempt: number): number {
  const { backoff } = policy;
  const base = backoff.initialMs * Math.pow(backoff.factor, attempt);
  const clamped = Math.min(base, backoff.maxMs);
  const jitter = clamped * backoff.jitter * (Math.random() * 2 - 1);
  return Math.round(clamped + jitter);
}

export class TelegramBotApiClient {
  private readonly policy: TelegramPolicy;

  constructor(
    private readonly config: TelegramConfig,
    opts?: {
      policy?: TelegramPolicyOverrides;
    },
  ) {
    this.policy = resolveTelegramPolicy(opts?.policy);
  }

  async sendMessage(
    chatId: number,
    text: string,
    parseModeOrOptions?: string | TelegramSendMessageOptions,
  ): Promise<void> {
    const options = typeof parseModeOrOptions === "string"
      ? { parseMode: parseModeOrOptions }
      : parseModeOrOptions;
    const maxRetries = this.policy.sendMaxRetries;
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const body: Record<string, unknown> = { chat_id: chatId, text };
        if (options?.parseMode) body.parse_mode = options.parseMode;

        const resp = await this.api("sendMessage", body, options?.signal);
        if (!resp.ok) {
          const err = new TelegramApiError("sendMessage", resp);
          if (err.errorCode === 429 && err.retryAfterMs && attempt < maxRetries) {
            console.log(`[telegram] rate limited, waiting ${err.retryAfterMs}ms`);
            await sleep(err.retryAfterMs, options?.signal);
            continue;
          }
          throw err;
        }
        return;
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && isSafeToRetrySend(err)) {
          const delay = computeBackoff(this.policy, attempt);
          console.log(
            `[telegram] send retry ${attempt + 1}/${maxRetries} in ${delay}ms`,
          );
          await sleep(delay, options?.signal);
          continue;
        }
        throw err;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Telegram sendMessage failed after retries");
  }

  async setMyCommands(commands: TelegramBotCommand[]): Promise<void> {
    const resp = await this.api("setMyCommands", { commands });
    if (!resp.ok) {
      throw new TelegramApiError("setMyCommands", resp);
    }
  }

  async getUpdates(
    offset: number,
    timeout: number,
    signal: AbortSignal,
  ): Promise<TelegramUpdate[]> {
    const resp = await this.api<TelegramUpdate[]>(
      "getUpdates",
      {
        offset,
        timeout,
        allowed_updates: ["message"],
      },
      signal,
    );

    if (!resp.ok) {
      throw new TelegramApiError("getUpdates", resp);
    }

    return resp.result ?? [];
  }

  async downloadFileById(
    fileId: string,
  ): Promise<{ filePath: string; data: Buffer }> {
    const file = await this.getFile(fileId);
    if (!file.file_path) {
      throw new Error(`getFile returned no file_path for ${fileId}`);
    }

    const data = await this.downloadFile(file.file_path);
    return { filePath: file.file_path, data };
  }

  private async getFile(fileId: string): Promise<TelegramFile> {
    const resp = await this.api<TelegramFile>("getFile", { file_id: fileId });
    if (!resp.ok || !resp.result?.file_path) {
      throw new TelegramApiError("getFile", resp);
    }
    return resp.result;
  }

  private async downloadFile(filePath: string): Promise<Buffer> {
    const fileUrl = `https://api.telegram.org/file/bot${this.config.token}/${filePath}`;
    const fileResp = await fetch(fileUrl);
    if (!fileResp.ok) {
      throw new Error(`file download failed: ${fileResp.status}`);
    }
    return Buffer.from(await fileResp.arrayBuffer());
  }

  private async api(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<TelegramApiResponse<unknown>>;
  private async api<T>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<TelegramApiResponse<T>>;
  private async api<T>(
    method: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<TelegramApiResponse<T>> {
    const url = `https://api.telegram.org/bot${this.config.token}/${method}`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    return resp.json() as Promise<TelegramApiResponse<T>>;
  }
}
