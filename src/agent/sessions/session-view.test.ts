import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationView } from "@earendil-works/pi-durable";
import { toSessionView } from "./session-view.ts";

type Entry = { kind: string; model?: unknown[]; data?: unknown };

function view(entries: Entry[], docs: Record<string, unknown> = {}): ConversationView {
  return { conversation: {}, entries, docs } as unknown as ConversationView;
}

const user = (text: string): Entry => ({
  kind: "pi.user",
  model: [{ role: "user", content: text }],
});

const assistant = (content: unknown[], stopReason: string): Entry => ({
  kind: "pi.assistant",
  model: [{ role: "assistant", content, stopReason }],
});

const toolCall = (id: string) => ({
  type: "toolCall",
  id,
  name: "bash",
  arguments: { command: "ls" },
});

const toolResult = (id: string, text: string, isError: boolean, data?: unknown): Entry => ({
  kind: "pi.tool-result",
  model: [{ role: "toolResult", toolCallId: id, content: [{ type: "text", text }], isError }],
  data,
});

test("a finished turn becomes user, assistant, tool and answer items", () => {
  const result = toSessionView(
    view([
      user("list the files"),
      assistant(
        [
          { type: "thinking", thinking: "I will look." },
          { type: "text", text: "Looking." },
          toolCall("call-1"),
        ],
        "toolUse",
      ),
      toolResult("call-1", "a.txt\n", false),
      assistant([{ type: "text", text: "One file." }], "stop"),
    ]),
  );

  assert.deepEqual(result.items, [
    { type: "user", text: "list the files" },
    {
      type: "assistant",
      text: "Looking.",
      thinking: "I will look.",
      streaming: false,
      stopReason: "toolUse",
    },
    {
      type: "tool",
      id: "call-1",
      name: "bash",
      args: '{"command":"ls"}',
      status: "done",
      output: "a.txt\n",
      notes: [],
    },
    { type: "assistant", text: "One file.", thinking: "", streaming: false, stopReason: "stop" },
  ]);
  assert.equal(result.entries, 4);
  assert.deepEqual(result.status.activity, { kind: "idle" });
  assert.equal(result.status.busy, false);
});

test("a tool cut off by a restart shows as interrupted, without the harness block", () => {
  const result = toSessionView(
    view([
      user("run it"),
      assistant([toolCall("call-1")], "toolUse"),
      toolResult(
        "call-1",
        "started\n<harness>\n[error] Tool bash was interrupted\n</harness>",
        true,
        { diagnostics: [{ severity: "error", code: "interrupted", message: "Tool bash was interrupted" }] },
      ),
    ]),
  );

  const tool = result.items[2];
  assert.deepEqual(tool, {
    type: "tool",
    id: "call-1",
    name: "bash",
    args: '{"command":"ls"}',
    status: "interrupted",
    output: "started",
    notes: ["Tool bash was interrupted"],
  });
});

test("a failed tool that was not interrupted shows as an error", () => {
  const result = toSessionView(
    view([
      user("run it"),
      assistant([toolCall("call-1")], "toolUse"),
      toolResult("call-1", "no such file", true),
    ]),
  );
  assert.equal(result.items[2]?.type === "tool" && result.items[2].status, "error");
});

test("tool calls of an answer that was cut off are marked as not run", () => {
  const result = toSessionView(view([user("go"), assistant([toolCall("call-1")], "aborted")]));
  const tool = result.items[2];
  assert.equal(tool?.type === "tool" && tool.status, "error");
  assert.equal(tool?.type === "tool" && tool.output, "Not run: the answer was interrupted.");
});

test("a streaming answer and its running tool come from live state", () => {
  const result = toSessionView(
    view([user("list the files")], {
      "pi.live": {
        run: { taskId: 1, inputs: [7] },
        generation: {
          attempt: 1,
          message: { role: "assistant", content: [{ type: "text", text: "Look" }, toolCall("call-1")] },
        },
        tools: [{ callId: "call-1", name: "bash", status: "running", output: "a.txt\n" }],
      },
    }),
  );

  assert.deepEqual(result.items.slice(1), [
    { type: "assistant", text: "Look", thinking: "", streaming: true, stopReason: null },
    {
      type: "tool",
      id: "call-1",
      name: "bash",
      args: '{"command":"ls"}',
      status: "running",
      output: "a.txt\n",
      notes: [],
    },
  ]);
  assert.deepEqual(result.status.activity, { kind: "tool", name: "bash" });
  assert.equal(result.status.busy, true);
});

test("status reports the model, summed usage, queued input and retries", () => {
  const result = toSessionView(
    view([], {
      "pi.agent": { model: { provider: "local", modelId: "qwen" } },
      "pi.usage": {
        models: {
          "local/qwen": { input: 10, output: 4, cost: { total: 0.5 } },
          "local/other": { input: 1, output: 2, cost: { total: 0.25 } },
        },
        tools: {},
      },
      "pi.inbox": {
        items: [
          { id: 8, mode: "followUp", content: "and then?" },
          { id: 9, mode: "write", entry: { kind: "app.note" } },
        ],
      },
      "pi.live": {
        run: { taskId: 1, inputs: [7] },
        generation: { attempt: 2, retry: { at: 0, error: "overloaded" } },
      },
    }),
  );

  assert.deepEqual(result.status, {
    activity: { kind: "retrying", error: "overloaded" },
    busy: true,
    queued: [
      { mode: "followUp", text: "and then?" },
      { mode: "write", text: "app.note" },
    ],
    model: { provider: "local", id: "qwen" },
    usage: { input: 11, output: 6, cost: 0.75 },
  });
});

test("resets and compactions become markers, and an empty session has no model", () => {
  const result = toSessionView(view([{ kind: "pi.reset" }, { kind: "pi.compaction" }]));
  assert.deepEqual(result.items, [
    { type: "marker", marker: "reset" },
    { type: "marker", marker: "compaction" },
  ]);
  assert.equal(result.status.model, null);
});
