import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConversationView, EntryRecord } from "@earendil-works/pi-durable";
import { pageOf, statusOf, windowOf } from "./session-view.durable.ts";

/*
 * The engine's records the real path can't be made to produce on demand: an
 * answer cut off in the middle of a tool call, and a model that is being retried.
 * What a finished turn, a live one and an interrupted tool look like is shown by
 * the tests that run turns.
 */

type Entry = { id: number; kind: string; model?: unknown[]; data?: unknown };

/** The model the agent's home names. */
const home = { provider: "local", modelId: "qwen" };

function view(entries: Entry[], docs: Record<string, unknown> = {}): ConversationView {
  return { conversation: {}, entries, docs } as unknown as ConversationView;
}

const user = (id: number, text: string): Entry => ({
  id,
  kind: "pi.user",
  model: [{ role: "user", content: text }],
});

const assistant = (id: number, content: unknown[], stopReason: string): Entry => ({
  id,
  kind: "pi.assistant",
  model: [{ role: "assistant", content, stopReason }],
});

const result = (id: number, callId: string, text: string): Entry => ({
  id,
  kind: "pi.tool-result",
  model: [{ role: "toolResult", toolCallId: callId, toolName: "bash", content: [{ type: "text", text }], isError: false }],
  data: { diagnostics: [] },
});

const toolCall = (id: string) => ({
  type: "toolCall",
  id,
  name: "bash",
  arguments: { command: "ls" },
});

test("tool calls of an answer that was cut off are marked as not run", () => {
  const shown = windowOf(view([user(1, "go"), assistant(2, [toolCall("call-1")], "aborted")]));
  const tool = shown.items[2];
  assert.equal(tool?.type === "tool" && tool.status, "error");
});

test("a page's last tool call is finished by its result after the page, and every item names the entry it came from", () => {
  const records = (entries: Entry[]): EntryRecord[] => entries as unknown as EntryRecord[];
  const page = pageOf(records([user(4, "list it"), assistant(5, [toolCall("call-1")], "toolUse")]), 3, records([result(6, "call-1", "a b c")]));
  assert.deepEqual(
    page.items.map((item) => [item.type, item.entry]),
    [["user", 4], ["assistant", 5], ["tool", 5]],
  );
  const tool = page.items[2];
  assert.deepEqual(tool?.type === "tool" ? [tool.status, tool.output] : undefined, ["done", "a b c"]);
  assert.equal(page.before, 3);
});

test("an image the session was shown, and one a tool gave back, is named by its media type apart from the text", () => {
  const image = { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" };
  const shownImage: Entry = { id: 1, kind: "pi.user", model: [{ role: "user", content: [{ type: "text", text: "what is this?" }, image] }] };
  const readImage: Entry = {
    id: 3,
    kind: "pi.tool-result",
    model: [{ role: "toolResult", toolCallId: "call-1", toolName: "read", content: [{ type: "text", text: "shot.jpg" }, { ...image, mimeType: "image/jpeg" }], isError: false }],
    data: { diagnostics: [] },
  };

  const [user, , tool] = windowOf(view([shownImage, assistant(2, [toolCall("call-1")], "toolUse"), readImage])).items;

  assert.deepEqual(user?.type === "user" ? [user.text, user.images] : undefined, ["what is this?", [{ mimeType: "image/png" }]]);
  assert.deepEqual(tool?.type === "tool" ? [tool.output, tool.images] : undefined, ["shot.jpg", [{ mimeType: "image/jpeg" }]]);
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

  assert.deepEqual(statusOf(session, home, []), {
    activity: { kind: "retrying", error: "overloaded" },
    busy: true,
    queued: [
      { mode: "followUp", text: "and then?" },
      { mode: "write", text: "app.note" },
    ],
    model: { provider: "local", id: "qwen" },
    ownModel: false,
    usage: { input: 11, output: 6, cost: 0.75 },
    wakeups: [],
    failure: null,
  });
});

test("status says the model is the session's own when it is not the home's", () => {
  const session = view([], { "pi.agent": { model: { provider: "local", modelId: "qwen" } } });

  assert.equal(statusOf(session, { provider: "local", modelId: "llama" }, []).ownModel, true);
  assert.equal(statusOf(session, home, []).ownModel, false);
  assert.equal(statusOf(view([]), home, []).ownModel, false, "a session with no model follows the home");
});
