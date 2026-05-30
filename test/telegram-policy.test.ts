import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  TelegramApiError,
  resolveTelegramPolicy,
} from "../dist/surfaces/telegram/client.js";

describe("resolveTelegramPolicy", () => {
  test("uses defaults when no overrides are provided", () => {
    const policy = resolveTelegramPolicy();

    assert.deepEqual(policy, {
      sendMaxRetries: 3,
      pollTimeoutSec: 30,
      backoff: {
        initialMs: 2000,
        maxMs: 30000,
        factor: 1.8,
        jitter: 0.25,
      },
      stallDetection: {
        thresholdMs: 90000,
        watchdogIntervalMs: 30000,
      },
    });
  });

  test("merges partial overrides with defaults", () => {
    const policy = resolveTelegramPolicy({
      sendMaxRetries: 5,
      backoff: {
        maxMs: 45_000,
      },
      stallDetection: {
        thresholdMs: 120_000,
      },
    });

    assert.equal(policy.sendMaxRetries, 5);
    assert.equal(policy.pollTimeoutSec, 30);
    assert.equal(policy.backoff.initialMs, 2000);
    assert.equal(policy.backoff.maxMs, 45_000);
    assert.equal(policy.stallDetection.thresholdMs, 120_000);
    assert.equal(policy.stallDetection.watchdogIntervalMs, 30000);
  });

  test("rejects invalid jitter and backoff bounds", () => {
    assert.throws(
      () => resolveTelegramPolicy({ backoff: { jitter: 1.2 } }),
      /telegram\.policy\.backoff\.jitter must be between 0 and 1/,
    );

    assert.throws(
      () => resolveTelegramPolicy({ backoff: { maxMs: 1000 } }),
      /telegram\.policy\.backoff\.maxMs must be >= telegram\.policy\.backoff\.initialMs/,
    );
  });

  test("treats getUpdates 5xx responses as recoverable", () => {
    const err = new TelegramApiError("getUpdates", {
      ok: false,
      error_code: 502,
      description: "Bad Gateway",
    });

    assert.equal(err.recoverable, true);
    assert.equal(err.retryAfterMs, undefined);
  });

  test("keeps sendMessage API failures non-recoverable", () => {
    const err = new TelegramApiError("sendMessage", {
      ok: false,
      error_code: 502,
      description: "Bad Gateway",
    });

    assert.equal(err.recoverable, false);
  });
});
