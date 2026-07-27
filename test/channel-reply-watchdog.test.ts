import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import { ChannelBus } from "../dist/channels/bus.js";
import {
  parseReviewDecision,
  reviewChannelReply,
} from "../dist/sessions/channel-reply-watchdog.js";

let root: string;
let bus: ChannelBus;

function model(): Model<Api> {
  return {
    id: "quick",
    name: "Quick",
    api: "openai-completions",
    provider: "test",
    baseUrl: "https://example.invalid",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
    maxTokens: 512,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "shrimpy-reply-watchdog-"));
  bus = new ChannelBus(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("channel reply watchdog", () => {
  test("skips review after the agent writes a visible message to the active channel", async () => {
    const message = bus.publishHumanText({
      channel: "home",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "Alice",
      transport: "telegram",
      text: "What happened?",
    });
    bus.publishAgentText({
      channel: "home",
      actorId: "agent:shrimpy",
      text: "It is fixed.",
    });
    let calls = 0;

    const result = await reviewChannelReply({
      runtime: {} as any,
      model: model(),
      channelBus: bus,
      channel: "home",
      agentId: "shrimpy",
      message,
      turn: { messages: [], assistantText: "Privately finished." },
    }, {
      quickCall: async () => {
        calls += 1;
        return { text: "WAKE\nReply.", response: {} as any };
      },
    });

    assert.deepEqual(result, { kind: "skipped" });
    assert.equal(calls, 0);
  });

  test("reviews bounded human and assistant tails and creates a tagged wake prompt", async () => {
    bus.publishHumanText({
      channel: "home",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "Alice",
      transport: "telegram",
      text: `older ${"a".repeat(3_000)}`,
    });
    const message = bus.publishHumanText({
      channel: "home",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "Alice",
      transport: "telegram",
      text: "Did it work?",
    });
    let quickPrompt = "";
    let quickMaxTokens: number | undefined;
    let quickTimeoutMs: number | undefined;

    const result = await reviewChannelReply({
      runtime: {} as any,
      model: model(),
      channelBus: bus,
      channel: "home",
      agentId: "shrimpy",
      message,
      turn: {
        messages: [],
        assistantText: `working ${"b".repeat(3_000)}`,
      },
    }, {
      quickCall: async (input) => {
        quickPrompt = input.prompt;
        quickMaxTokens = input.maxTokens;
        quickTimeoutMs = input.timeoutMs;
        return {
          text: "WAKE\nTell the human the work completed.",
          response: {} as any,
        };
      },
    });

    assert.equal(result.kind, "wake");
    assert.match(quickPrompt, /<recent-human-messages>/);
    assert.match(quickPrompt, /Did it work\?/);
    assert.match(quickPrompt, /\[truncated\]/);
    assert.ok(quickPrompt.length < 5_000);
    assert.equal(quickMaxTokens, undefined);
    assert.equal(quickTimeoutMs, undefined);
    if (result.kind === "wake") {
      assert.match(result.prompt, /^\[shrimpy:channel-reply-recovery\]/);
      assert.match(result.prompt, /Tell the human the work completed/);
      assert.match(result.prompt, /publish it with reply, ask, notify, or report/);
    }
  });

  test("does not review agent-authored turns", async () => {
    const message = bus.publishAgentText({
      channel: "dm~helper~shrimpy",
      actorId: "agent:helper",
      text: "Thanks!",
    });
    let calls = 0;

    const result = await reviewChannelReply({
      runtime: {} as any,
      model: model(),
      channelBus: bus,
      channel: "dm~helper~shrimpy",
      agentId: "shrimpy",
      message,
      turn: { messages: [], assistantText: "" },
    }, {
      quickCall: async () => {
        calls += 1;
        return { text: "NO_WAKE", response: {} as any };
      },
    });

    assert.deepEqual(result, { kind: "skipped" });
    assert.equal(calls, 0);
  });
});

describe("parseReviewDecision", () => {
  test("accepts only the compact control protocol", () => {
    assert.deepEqual(parseReviewDecision("NO_WAKE"), { kind: "reviewed" });
    assert.deepEqual(parseReviewDecision("WAKE\nReply with the result."), {
      kind: "wake",
      reminder: "Reply with the result.",
    });
    assert.throws(
      () => parseReviewDecision("The agent should probably wake."),
      /invalid decision/,
    );
  });
});
