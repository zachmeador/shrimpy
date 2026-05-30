import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { streamSimple } from "@earendil-works/pi-ai";
import {
  formatThinkingInputs,
  isThinkingLevel,
  parseThinkingLevel,
} from "../dist/inference/thinking.js";

const qwenChatTemplateModel = {
  id: "qwen3.6",
  name: "Qwen 3.6",
  provider: "local_qwen",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1:1/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 262144,
  maxTokens: 8192,
  compat: {
    supportsDeveloperRole: false,
    supportsReasoningEffort: false,
    thinkingFormat: "qwen-chat-template",
  },
};

async function captureQwenPayload(reasoning?: string): Promise<any> {
  let payload: any;
  const stream = streamSimple(qwenChatTemplateModel as any, {
    messages: [{
      role: "user",
      content: [{ type: "text", text: "hello" }],
      timestamp: Date.now(),
    }],
  }, {
    apiKey: "local",
    maxTokens: 64,
    reasoning: reasoning as any,
    onPayload(nextPayload) {
      payload = nextPayload;
      throw new Error("stop after payload");
    },
  });

  await stream.result().catch(() => {});
  assert.ok(payload);
  return payload;
}

describe("thinking helpers", () => {
  test("parses canonical thinking levels", () => {
    assert.equal(parseThinkingLevel("off"), "off");
    assert.equal(parseThinkingLevel("HIGH"), "high");
  });

  test("maps on to medium thinking", () => {
    assert.equal(parseThinkingLevel("on"), "medium");
  });

  test("keeps aliases out of persisted level validation", () => {
    assert.equal(isThinkingLevel("on"), false);
    assert.equal(isThinkingLevel(parseThinkingLevel("on")), true);
  });

  test("advertises the on alias in user-facing input help", () => {
    assert.match(formatThinkingInputs(), /on \(= medium\)/);
  });

  test("qwen chat-template config disables thinking when reasoning is omitted", async () => {
    const payload = await captureQwenPayload(undefined);

    assert.deepEqual(payload.chat_template_kwargs, {
      enable_thinking: false,
      preserve_thinking: true,
    });
    assert.equal(payload.enable_thinking, undefined);
    assert.equal(payload.reasoning_effort, undefined);
  });

  test("qwen chat-template config enables thinking when reasoning is set", async () => {
    const payload = await captureQwenPayload("medium");

    assert.deepEqual(payload.chat_template_kwargs, {
      enable_thinking: true,
      preserve_thinking: true,
    });
  });
});
