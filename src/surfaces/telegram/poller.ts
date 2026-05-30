/**
 * Long-poll loop over a TelegramBotApiClient.
 *
 * Owns: offset, polling backoff, abort/restart, stall detection,
 * update handler fan-out. Knows nothing about channels — emits raw
 * TelegramUpdates for bridge.ts to translate.
 */

import {
  computeBackoff,
  isAbortError,
  isRecoverableError,
  resolveTelegramPolicy,
  sleep,
  TelegramApiError,
  type TelegramBotApiClient,
  type TelegramPolicy,
  type TelegramPolicyOverrides,
  type TelegramUpdate,
} from "./client.js";

export type TelegramUpdateHandler = (
  update: TelegramUpdate,
) => Promise<void> | void;

export type TelegramUpdateErrorHandler = (
  update: TelegramUpdate,
  error: unknown,
) => Promise<void> | void;

export interface TelegramPollerOptions {
  initialOffset?: number;
  onUpdateOffset?: (offset: number) => void;
  onUpdateError?: TelegramUpdateErrorHandler;
  policy?: TelegramPolicyOverrides;
}

export class TelegramPoller {
  private readonly policy: TelegramPolicy;
  private offset = 0;
  private running = false;
  private abortController: AbortController | null = null;
  private restartAttempts = 0;
  private lastPollTime = 0;
  private pollRequestStartedAt = 0;
  private restartRequested = false;
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private pollLoopPromise: Promise<void> | null = null;
  private readonly onUpdateOffset?: (offset: number) => void;
  private readonly onUpdateError?: TelegramUpdateErrorHandler;
  private readonly updateHandlers = new Set<TelegramUpdateHandler>();

  constructor(
    private readonly client: TelegramBotApiClient,
    opts?: TelegramPollerOptions,
  ) {
    this.policy = resolveTelegramPolicy(opts?.policy);
    if (opts?.initialOffset) this.offset = opts.initialOffset;
    this.onUpdateOffset = opts?.onUpdateOffset;
    this.onUpdateError = opts?.onUpdateError;
  }

  onUpdate(handler: TelegramUpdateHandler): () => void {
    this.updateHandlers.add(handler);
    return () => this.updateHandlers.delete(handler);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.restartAttempts = 0;
    this.startStallDetection();
    this.pollLoopPromise = this.pollLoop().finally(() => {
      this.pollLoopPromise = null;
    });
    console.log("[telegram] poller started");
  }

  async stop(): Promise<void> {
    if (!this.running && !this.pollLoopPromise) {
      this.stopStallDetection();
      return;
    }
    this.running = false;
    this.abortController?.abort();
    this.stopStallDetection();
    await this.pollLoopPromise;
    console.log("[telegram] poller stopped");
  }

  private async pollLoop(): Promise<void> {
    while (this.running) {
      try {
        this.abortController = new AbortController();
        this.pollRequestStartedAt = Date.now();
        const updates = await this.client.getUpdates(
          this.offset,
          this.policy.pollTimeoutSec,
          this.abortController.signal,
        );
        this.abortController = null;
        this.pollRequestStartedAt = 0;
        this.lastPollTime = Date.now();
        this.restartAttempts = 0;

        for (const update of updates) {
          await this.notifyUpdate(update);
          this.offset = update.update_id + 1;
          this.onUpdateOffset?.(this.offset);
        }
      } catch (err) {
        this.abortController = null;
        this.pollRequestStartedAt = 0;
        if (!this.running) break;
        if (isAbortError(err)) {
          if (this.restartRequested) {
            this.restartRequested = false;
            continue;
          }
          break;
        }

        if (isRecoverableError(err)) {
          this.restartAttempts++;
          const delay = err instanceof TelegramApiError && err.retryAfterMs
            ? err.retryAfterMs
            : computeBackoff(this.policy, this.restartAttempts);
          console.error(
            `[telegram] poll error (attempt ${this.restartAttempts}), retry in ${delay}ms:`,
            (err as Error).message,
          );
          this.abortController = new AbortController();
          try {
            await sleep(delay, this.abortController.signal);
          } catch (sleepErr) {
            this.abortController = null;
            if (!this.running || isAbortError(sleepErr)) break;
            throw sleepErr;
          }
          this.abortController = null;
        } else {
          console.error("[telegram] fatal poll error:", err);
          this.running = false;
          break;
        }
      }
    }
  }

  private async notifyUpdate(update: TelegramUpdate): Promise<void> {
    for (const handler of [...this.updateHandlers]) {
      try {
        await handler(update);
      } catch (err) {
        console.error("[telegram] update handler error:", err);
        if (this.onUpdateError) {
          try {
            await this.onUpdateError(update, err);
          } catch (errorHandlerErr) {
            console.error("[telegram] update error handler failed:", errorHandlerErr);
          }
        }
      }
    }
  }

  private startStallDetection(): void {
    const {
      thresholdMs: STALL_THRESHOLD_MS,
      watchdogIntervalMs: WATCHDOG_INTERVAL_MS,
    } = this.policy.stallDetection;

    this.stallTimer = setInterval(() => {
      if (!this.running) return;
      if (this.pollRequestStartedAt === 0) return;

      const elapsed = Date.now() - this.pollRequestStartedAt;
      if (elapsed > STALL_THRESHOLD_MS) {
        console.warn(
          `[telegram] poll stalled for ${Math.round(elapsed / 1000)}s, forcing restart`,
        );
        this.restartRequested = true;
        this.abortController?.abort();
      }
    }, WATCHDOG_INTERVAL_MS);

    this.stallTimer.unref();
  }

  private stopStallDetection(): void {
    if (this.stallTimer) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
  }
}
