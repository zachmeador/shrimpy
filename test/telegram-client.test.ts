import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { TelegramBotApiClient } from "../dist/surfaces/telegram/client.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("TelegramBotApiClient", () => {
  test("setMyCommands posts Telegram bot commands", async () => {
    let requestUrl = "";
    let requestBody = "";

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = String(input);
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ ok: true, result: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const client = new TelegramBotApiClient({ token: "123:test" });
    await client.setMyCommands([
      { command: "help", description: "Show help" },
      { command: "status", description: "Show status" },
    ]);

    assert.match(requestUrl, /\/setMyCommands$/);
    assert.match(requestBody, /"command":"help"/);
    assert.match(requestBody, /"command":"status"/);
  });

  test("sendMessage throws when rate limit retries are exhausted", async () => {
    let calls = 0;

    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({
        ok: false,
        error_code: 429,
        description: "Too Many Requests",
        parameters: { retry_after: 0.001 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const client = new TelegramBotApiClient(
      { token: "123:test" },
      { policy: { sendMaxRetries: 1 } },
    );

    await assert.rejects(
      () => client.sendMessage(42, "hello"),
      /sendMessage failed/,
    );
    assert.equal(calls, 2);
  });
});
