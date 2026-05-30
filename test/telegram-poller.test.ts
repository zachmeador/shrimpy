import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TelegramBotApiClient } from "../dist/surfaces/telegram/client.js";
import { TelegramPoller } from "../dist/surfaces/telegram/poller.js";

const originalFetch = globalThis.fetch;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function createPoller(opts: ConstructorParameters<typeof TelegramPoller>[1] = {}) {
  const client = new TelegramBotApiClient(
    { token: "123:test" },
    { policy: opts.policy },
  );
  return new TelegramPoller(client, opts);
}

describe("TelegramPoller shutdown", () => {
  test("stop aborts an in-flight getUpdates request", async () => {
    let aborted = false;
    let started = false;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      started = true;
      return await new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        };
        init?.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }) as typeof fetch;

    const poller = createPoller({ policy: { pollTimeoutSec: 30 } });
    poller.start();

    for (let i = 0; i < 50 && !started; i++) {
      await sleep(10);
    }
    assert.equal(started, true);

    const startedAt = Date.now();
    await poller.stop();
    const elapsedMs = Date.now() - startedAt;

    assert.equal(aborted, true);
    assert.ok(elapsedMs < 500, `expected stop to finish quickly, took ${elapsedMs}ms`);
  });

  test("watchdog abort restarts polling instead of exiting the loop", async () => {
    let calls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }) as typeof fetch;

    const poller = createPoller({
      policy: {
        pollTimeoutSec: 30,
        stallDetection: {
          thresholdMs: 20,
          watchdogIntervalMs: 10,
        },
      },
    });
    poller.start();

    for (let i = 0; i < 50 && calls < 2; i++) {
      await sleep(10);
    }

    await poller.stop();

    assert.ok(calls >= 2, `expected watchdog restart, got ${calls} poll calls`);
  });

  test("stop aborts recoverable retry sleep", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls++;
      const error = new Error("fetch failed");
      (error as any).code = "ECONNRESET";
      throw error;
    }) as typeof fetch;

    const poller = createPoller({
      policy: {
        backoff: {
          initialMs: 5000,
          maxMs: 5000,
          factor: 1,
          jitter: 0,
        },
      },
    });
    poller.start();

    for (let i = 0; i < 50 && calls === 0; i++) {
      await sleep(10);
    }
    assert.ok(calls > 0);

    await sleep(25);

    const startedAt = Date.now();
    await poller.stop();
    const elapsedMs = Date.now() - startedAt;

    assert.ok(elapsedMs < 500, `expected stop to abort retry sleep, took ${elapsedMs}ms`);
  });

  test("reports update handler errors and still advances offset", async () => {
    const offsets: number[] = [];
    const errors: Array<{ updateId: number; message: string }> = [];
    let calls = 0;

    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls++;
      if (calls === 1) {
        return new Response(JSON.stringify({
          ok: true,
          result: [{
            update_id: 10,
            message: {
              message_id: 20,
              date: 1,
              chat: { id: 42, type: "private" },
              text: "boom",
            },
          }],
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }) as typeof fetch;

    const poller = createPoller({
      onUpdateOffset: (offset) => offsets.push(offset),
      onUpdateError: (update, err) => {
        errors.push({
          updateId: update.update_id,
          message: (err as Error).message,
        });
      },
    });
    poller.onUpdate(() => {
      throw new Error("handler exploded");
    });
    poller.start();

    for (let i = 0; i < 50 && offsets.length === 0; i++) {
      await sleep(10);
    }
    await poller.stop();

    assert.deepEqual(errors, [{ updateId: 10, message: "handler exploded" }]);
    assert.deepEqual(offsets, [11]);
  });
});
