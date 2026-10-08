import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationView } from "@earendil-works/pi-durable";
import { toSessionView } from "./session-view.durable.ts";

/*
 * The engine's records the real path can't be made to produce on demand: an
 * answer cut off in the middle of a tool call, and a model that is being retried.
 * What a finished turn, a live one and an interrupted tool look like is shown by
 * the tests that run turns.
 */

type Entry = { kind: string; model?: unknown[]; data?: unknown };

/** The model the agent's home names. */
const home = { provider: "local", modelId: "qwen" };

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

test("tool calls of an answer that was cut off are marked as not run", () => {
  const result = toSessionView(view([user("go"), assistant([toolCall("call-1")], "aborted")]), home);
  const tool = result.items[2];
  assert.equal(tool?.type === "tool" && tool.status, "error");
});

test("status reports the model, summed usage, queued input and retries", () => {
  const session = view([], {
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
  });

  assert.deepEqual(toSessionView(session, home).status, {
    activity: { kind: "retrying", error: "overloaded" },
    busy: true,
    queued: [
      { mode: "followUp", text: "and then?" },
      { mode: "write", text: "app.note" },
    ],
    model: { provider: "local", id: "qwen" },
    ownModel: false,
    usage: { input: 11, output: 6, cost: 0.75 },
  });
});

test("status says the model is the session's own when it is not the home's", () => {
  const session = view([], { "pi.agent": { model: { provider: "local", modelId: "qwen" } } });

  assert.equal(toSessionView(session, { provider: "local", modelId: "llama" }).status.ownModel, true);
  assert.equal(toSessionView(session, home).status.ownModel, false);
  assert.equal(toSessionView(view([]), home).status.ownModel, false, "a session with no model follows the home");
});
