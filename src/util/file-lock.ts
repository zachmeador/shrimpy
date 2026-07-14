import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { lockSync } from "proper-lockfile";

const DEFAULT_STALE_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MIN_RETRY_MS = 25;
const DEFAULT_MAX_RETRY_MS = 75;
const SLEEP_STATE = new Int32Array(new SharedArrayBuffer(4));

interface FileTransactionLockOptions {
  staleMs?: number;
  timeoutMs?: number;
  minRetryMs?: number;
  maxRetryMs?: number;
  now?: () => number;
  random?: () => number;
  sleep?: (ms: number) => void;
}

export function withFileTransactionLock<T>(
  targetPath: string,
  operation: () => T,
  options: FileTransactionLockOptions = {},
): T {
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const minRetryMs = options.minRetryMs ?? DEFAULT_MIN_RETRY_MS;
  const maxRetryMs = options.maxRetryMs ?? DEFAULT_MAX_RETRY_MS;
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? sleepSync;
  const deadline = now() + timeoutMs;

  mkdirSync(dirname(targetPath), { recursive: true });

  let release: (() => void) | undefined;
  let contentionError: unknown;
  while (!release) {
    if (contentionError && now() >= deadline) {
      throwLockTimeout(targetPath, timeoutMs, contentionError);
    }
    try {
      release = lockSync(targetPath, {
        realpath: false,
        stale: staleMs,
        update: Math.max(1_000, Math.floor(staleMs / 2)),
      });
    } catch (error) {
      if (!isLockContention(error)) throw error;
      contentionError = error;
      if (now() >= deadline) {
        throwLockTimeout(targetPath, timeoutMs, error);
      }
      const retryDelay = randomRetryDelay(minRetryMs, maxRetryMs, random);
      const remainingMs = deadline - now();
      if (remainingMs <= 0) {
        throwLockTimeout(targetPath, timeoutMs, error);
      }
      sleep(Math.min(retryDelay, remainingMs));
    }
  }

  try {
    return operation();
  } finally {
    release();
  }
}

function throwLockTimeout(
  targetPath: string,
  timeoutMs: number,
  cause: unknown,
): never {
  throw new Error(
    `timed out after ${timeoutMs}ms waiting for state lock: ${targetPath}`,
    { cause },
  );
}

function isLockContention(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ELOCKED",
  );
}

function randomRetryDelay(
  minMs: number,
  maxMs: number,
  random: () => number,
): number {
  const min = Math.max(0, Math.min(minMs, maxMs));
  const max = Math.max(min, maxMs);
  return min + Math.floor(random() * (max - min + 1));
}

function sleepSync(ms: number): void {
  Atomics.wait(SLEEP_STATE, 0, 0, ms);
}
