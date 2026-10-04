import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type {
  Api,
  AssistantMessage,
  Context,
  Model,
  SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { runQuickCall } from "../dist/inference/quick-call.js";

function model(): Model<Api> {
  return {
    id: "quick",
    name: "Quick",
    api: "openai-completions",
    provider: "test",
    baseUrl: "https://example.invalid",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 32_000,
    maxTokens: 128,
  };
}

function assistant(text: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    api: "openai-completions",
    provider: "test",
    model: "quick",
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

describe("runQuickCall", () => {
  test("sends only the supplied instruction and prompt with bounded output", async () => {
    let capturedContext: Context | undefined;
    let capturedOptions: SimpleStreamOptions | undefined;
    const result = await runQuickCall({
      runtime: {
        async completeSimple(_model, context, options) {
          capturedContext = context;
          capturedOptions = options;
          return assistant(" WAKE\nPublish the result. ");
        },
      },
      model: model(),
      systemPrompt: " narrow instruction ",
      prompt: "small input",
      maxTokens: 500,
    });

    assert.equal(result.text, "WAKE\nPublish the result.");
    assert.equal(capturedContext?.systemPrompt, "narrow instruction");
    assert.deepEqual(capturedContext?.messages, [{
      role: "user",
      content: [{ type: "text", text: "small input" }],
      timestamp: capturedContext?.messages[0]?.timestamp,
    }]);
    assert.equal(capturedOptions?.maxTokens, 128);
    assert.equal(capturedOptions?.cacheRetention, "none");
    assert.equal(capturedOptions?.reasoning, "minimal");
    assert.ok(capturedOptions?.sessionId);
  });

  test("surfaces provider error responses", async () => {
    const failed = assistant("");
    failed.stopReason = "error";
    failed.errorMessage = "provider unavailable";

    await assert.rejects(
      runQuickCall({
        runtime: {
          async completeSimple() {
            return failed;
          },
        },
        model: model(),
        prompt: "input",
      }),
      /provider unavailable/,
    );
  });

  test("leaves room for provider-side thinking without enabling reasoning", async () => {
    let capturedOptions: SimpleStreamOptions | undefined;
    const nonReasoningModel = {
      ...model(),
      reasoning: false,
      maxTokens: 8_192,
    };

    await runQuickCall({
      runtime: {
        async completeSimple(_model, _context, options) {
          capturedOptions = options;
          return assistant("NO_WAKE");
        },
      },
      model: nonReasoningModel,
      prompt: "input",
    });

    assert.equal(capturedOptions?.maxTokens, 512);
    assert.equal(capturedOptions?.reasoning, undefined);
  });
});
