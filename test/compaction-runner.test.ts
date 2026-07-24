import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  compactSessionHistory,
  resolveCompactionMaxTokens,
} from "../dist/sessions/compaction/runner.js";

const localModel = {
  provider: "local_llm",
  id: "local-coder",
  name: "Local Coder",
  api: "openai-completions",
  baseUrl: "http://example.test/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 262144,
  maxTokens: 8192,
};

describe("compaction runner", () => {
  test("summarizes history and split turns with the selected Pi model", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    const maxTokens: number[] = [];

    const result = await compactSessionHistory(
      {
        firstKeptEntryId: "entry-keep",
        messagesToSummarize: [
          { role: "user", content: "history to summarize", timestamp: 1 },
        ],
        turnPrefixMessages: [
          { role: "user", content: "turn prefix to summarize", timestamp: 2 },
        ],
        isSplitTurn: true,
        tokensBefore: 12345,
        previousSummary: "Earlier summary.",
        fileOps: {
          read: new Set(["src/read.ts", "src/changed.ts"]),
          edited: new Set(["src/changed.ts"]),
          written: new Set(["src/new.ts"]),
        },
        settings: { reserveTokens: 100000 },
      },
      localModel as any,
      {
        apiKey: "test-key",
        headers: { "x-test": "1" },
        customInstructions: "Preserve approximate time anchors.",
        complete: async (model, _context, options) => {
          const initial = {
            model: model.id,
            max_tokens: options.maxTokens,
          };
          assert.equal("onPayload" in options, false);
          payloads.push(initial);
          maxTokens.push(options.maxTokens);
          return assistantMessage(`summary ${payloads.length}`);
        },
      },
    );

    assert.equal(payloads.length, 2);
    assert.deepEqual(maxTokens, [8192, 8192]);
    for (const payload of payloads) {
      assert.equal(payload.model, "local-coder");
      assert.equal(payload.max_tokens, 8192);
    }
    assert.match(result.summary, /summary 1/);
    assert.match(result.summary, /Turn Context \(split turn\)/);
    assert.match(result.summary, /summary 2/);
    assert.match(result.summary, /<read-files>\nsrc\/read\.ts\n<\/read-files>/);
    assert.match(
      result.summary,
      /<modified-files>\nsrc\/changed\.ts\nsrc\/new\.ts\n<\/modified-files>/,
    );
    assert.deepEqual(result.details, {
      readFiles: ["src/read.ts"],
      modifiedFiles: ["src/changed.ts", "src/new.ts"],
    });
  });

  test("frames summarization with the parent agent system prompt", async () => {
    const requests: Array<{ systemPrompt?: string; userPrompt: string }> = [];

    await compactSessionHistory(
      {
        firstKeptEntryId: "entry-keep",
        messagesToSummarize: [
          { role: "user", content: "Summarize this while staying in voice.", timestamp: 1 },
        ],
        turnPrefixMessages: [],
        isSplitTurn: false,
        tokensBefore: 12345,
        fileOps: {
          read: new Set(),
          edited: new Set(),
          written: new Set(),
        },
        settings: { reserveTokens: 1000 },
      },
      localModel as any,
      {
        apiKey: "test-key",
        sessionSystemPrompt: [
          "# SOUL",
          "You are Ole Scrappy, direct and dry.",
          "Keep a terse, practical voice.",
        ].join("\n"),
        complete: async (_model, context) => {
          requests.push({
            systemPrompt: context.systemPrompt,
            userPrompt: readUserPrompt(context),
          });
          return assistantMessage("summary");
        },
      },
    );

    assert.equal(requests.length, 1);
    assert.match(requests[0].systemPrompt ?? "", /<session-agent-context>/);
    assert.match(requests[0].systemPrompt ?? "", /You are Ole Scrappy/);
    assert.match(
      requests[0].systemPrompt ?? "",
      /who the agent is, how it talks, how it works/,
    );
    assert.match(
      requests[0].userPrompt,
      /identity, voice, tone, working habits/,
    );
    assert.match(
      requests[0].userPrompt,
      /Use work-tracking sections only when there is actual work to track/,
    );
  });

  test("preserves Pi-style summarization errors", async () => {
    await assert.rejects(
      compactSessionHistory(
        {
          firstKeptEntryId: "entry-keep",
          messagesToSummarize: [
            { role: "user", content: "history to summarize", timestamp: 1 },
          ],
          turnPrefixMessages: [],
          isSplitTurn: false,
          tokensBefore: 12345,
          fileOps: {
            read: new Set(),
            edited: new Set(),
            written: new Set(),
          },
          settings: { reserveTokens: 1000 },
        },
        localModel as any,
        {
          apiKey: "test-key",
          complete: async () => assistantMessage("", "error", "503 status code (no body)"),
        },
      ),
      /Summarization failed: 503 status code \(no body\)/,
    );
  });

  test("chunks oversized history before merging a final summary", async () => {
    const compactModel = {
      ...localModel,
      contextWindow: 20_000,
      maxTokens: 6_000,
    };
    const payloads: Array<Record<string, unknown>> = [];
    const prompts: string[] = [];

    const result = await compactSessionHistory(
      {
        firstKeptEntryId: "entry-keep",
        messagesToSummarize: [
          { role: "user", content: "first oversized block ".repeat(1_000), timestamp: 1 },
          { role: "assistant", content: [{ type: "text", text: "middle oversized block ".repeat(1_000) }], timestamp: 2 },
          { role: "user", content: "final oversized block ".repeat(1_000), timestamp: 3 },
        ],
        turnPrefixMessages: [],
        isSplitTurn: false,
        tokensBefore: 90_000,
        previousSummary: "Existing compacted context.",
        fileOps: {
          read: new Set(),
          edited: new Set(),
          written: new Set(),
        },
        settings: { reserveTokens: 100_000 },
      },
      compactModel as any,
      {
        apiKey: "test-key",
        complete: async (model, context, options) => {
          const text = readUserPrompt(context);
          prompts.push(text);
          const initial = {
            model: model.id,
            max_tokens: options.maxTokens,
          };
          assert.equal("onPayload" in options, false);
          payloads.push(initial);
          return assistantMessage(`summary ${prompts.length}`);
        },
      },
    );

    assert.ok(prompts.length > 2);
    assert.match(prompts[0], /chunk="1"/);
    assert.match(prompts.at(-1) ?? "", /<chunk-summaries>/);
    assert.match(prompts.at(-1) ?? "", /<previous-summary>\nExisting compacted context\./);
    assert.equal(result.summary, `summary ${prompts.length}`);
    for (const payload of payloads) {
      assert.equal(payload.model, "local-coder");
      assert.ok((payload.max_tokens as number) <= compactModel.maxTokens);
    }
  });

  test("caps compaction max tokens to the selected model limit", () => {
    assert.equal(resolveCompactionMaxTokens(localModel as any, 80000), 8192);
    assert.equal(resolveCompactionMaxTokens(localModel as any, 4000), 4000);
  });
});

function assistantMessage(
  text: string,
  stopReason = "stop",
  errorMessage?: string,
) {
  return {
    role: "assistant",
    content: text ? [{ type: "text", text }] : [],
    api: "openai-completions",
    provider: "local_llm",
    model: "local-coder",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    errorMessage,
    timestamp: Date.now(),
  } as any;
}

function readUserPrompt(context: any): string {
  const content = context.messages[0].content[0];
  return content.text;
}
