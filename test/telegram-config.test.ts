import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTelegramDefaultAgentIds,
  resolveTelegramRuntimeConfig,
} from "../dist/surfaces/telegram/config.js";

describe("resolveTelegramRuntimeConfig", () => {
  test("resolves telegram surface instances with stable ids and prefixes", () => {
    const resolved = resolveTelegramRuntimeConfig({
      instances: {
        shrimpy: {
          token: "123:abc",
          defaultAgentId: "shrimpy",
          allowedChatIds: [3],
        },
        helper: {
          token: "456:def",
          defaultAgentId: "helper",
          allowedChatIds: [1, 2],
          users: {
            "7": {
              id: "alice",
              displayName: "Alice",
            },
          },
          textBurstWindowMs: 250,
          mediaGroupWindowMs: 750,
        },
      },
    }, ["shrimpy", "helper"]);

    assert.deepEqual(resolved.instances, [
      {
        id: "helper",
        surfaceId: "telegram.helper",
        adapter: "telegram.helper",
        channelPrefix: "telegram~helper~",
        token: "456:def",
        defaultAgentId: "helper",
        allowedChatIds: [1, 2],
        users: {
          "7": {
            userId: "alice",
            actorId: "human:alice",
            displayName: "Alice",
          },
        },
        textBurstWindowMs: 250,
        mediaGroupWindowMs: 750,
        policy: undefined,
      },
      {
        id: "shrimpy",
        surfaceId: "telegram.shrimpy",
        adapter: "telegram.shrimpy",
        channelPrefix: "telegram~shrimpy~",
        token: "123:abc",
        defaultAgentId: "shrimpy",
        allowedChatIds: [3],
        users: {},
        textBurstWindowMs: undefined,
        mediaGroupWindowMs: undefined,
        policy: undefined,
      },
    ]);
  });

  test("rejects unknown default agents", () => {
    assert.throws(
      () =>
        resolveTelegramRuntimeConfig({
          instances: {
            shrimpy: {
              token: "123:abc",
              defaultAgentId: "missing",
            },
          },
        }, ["shrimpy"]),
      /unknown agent "missing"/,
    );
  });

  test("requires an explicit inbound allowlist", () => {
    assert.throws(
      () =>
        resolveTelegramRuntimeConfig({
          instances: {
            shrimpy: {
              token: "123:abc",
              defaultAgentId: "shrimpy",
            },
          },
        }, ["shrimpy"]),
      /telegram\.instances\.shrimpy\.allowedChatIds must contain at least one Telegram chat id/,
    );
    assert.throws(
      () =>
        resolveTelegramRuntimeConfig({
          instances: {
            shrimpy: {
              token: "123:abc",
              defaultAgentId: "shrimpy",
              allowedChatIds: [],
            },
          },
        }, ["shrimpy"]),
      /Expected array length to be greater or equal to 1/,
    );
  });
});

describe("telegram surface helpers", () => {
  test("matches surface thread channels to default agents", () => {
    const config = resolveTelegramRuntimeConfig({
      instances: {
        shrimpy: {
          token: "123:abc",
          defaultAgentId: "shrimpy",
          allowedChatIds: [1],
        },
        helper: {
          token: "456:def",
          defaultAgentId: "helper",
          allowedChatIds: [123],
        },
      },
    }, ["shrimpy", "helper"]);

    assert.deepEqual(
      resolveTelegramDefaultAgentIds(config, "telegram~helper~123"),
      ["helper"],
    );
    assert.deepEqual(
      resolveTelegramDefaultAgentIds(config, "home"),
      [],
    );
  });
});
