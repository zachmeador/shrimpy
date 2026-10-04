import assert from "node:assert/strict";
import { test } from "node:test";
import type { SessionItem, SessionStatus, SessionView } from "../../contracts/agent/index.ts";
import { renderSession } from "./render.ts";

const idle: SessionStatus = {
  activity: { kind: "idle" },
  busy: false,
  queued: [],
  model: { provider: "local", id: "qwen" },
  usage: { input: 120, output: 45, cost: 0 },
};

function view(items: SessionItem[], status: Partial<SessionStatus> = {}): SessionView {
  return { items, status: { ...idle, ...status }, entries: items.length };
}

const answer = (text: string, stopReason: string | null, streaming = false): SessionItem => ({
  type: "assistant",
  text,
  thinking: "private thoughts",
  streaming,
  stopReason,
});

test("a turn reads as labelled blocks, without the model's thinking", () => {
  const text = renderSession(
    view([
      { type: "user", text: "list the files" },
      answer("Looking.", "toolUse"),
      {
        type: "tool",
        id: "c1",
        name: "bash",
        args: '{"command":"ls"}',
        status: "done",
        output: "a.txt\nb.txt\n",
        notes: [],
      },
      answer("Two files.", "stop"),
    ]),
  );

  assert.equal(
    text,
    [
      "you",
      "  list the files",
      "",
      "assistant",
      "  Looking.",
      "",
      "tool bash (done)",
      '  {"command":"ls"}',
      "  a.txt",
      "  b.txt",
      "",
      "assistant",
      "  Two files.",
      "",
      "idle · local/qwen · 120 in, 45 out",
    ].join("\n"),
  );
});

test("an answer that is streaming, cut off or failed says so", () => {
  const text = renderSession(
    view([answer("Par", null, true), answer("Cut", "aborted"), answer("", "error")], {
      activity: { kind: "answering" },
    }),
  );
  assert.match(text, /^assistant \(answering\)\n {2}Par\n\nassistant \(cut off\)\n {2}Cut\n\nassistant \(failed\)\n\nanswering · /);
});

test("a tool that was interrupted shows its notes, and markers show where context restarted", () => {
  const text = renderSession(
    view([
      { type: "marker", marker: "reset" },
      {
        type: "tool",
        id: "c1",
        name: "bash",
        args: "{}",
        status: "interrupted",
        output: "started",
        notes: ["Tool bash was interrupted and may have partially run"],
      },
    ]),
  );
  assert.match(text, /^-- reset --\n\ntool bash \(interrupted\)\n {2}\{\}\n {2}started\n {2}note: Tool bash was interrupted and may have partially run\n/);
});

test("the status line names the activity, the model, usage, cost and queued input", () => {
  const busy = renderSession(
    view([], {
      activity: { kind: "tool", name: "bash" },
      usage: { input: 1000, output: 20, cost: 0.0123 },
      queued: [{ mode: "steer", text: "also this" }],
    }),
  );
  assert.equal(busy, "running bash · local/qwen · 1000 in, 20 out · $0.0123 · 1 queued");

  const retrying = renderSession(view([], { activity: { kind: "retrying", error: "overloaded" }, model: null }));
  assert.equal(retrying, "retrying after: overloaded · no model · 120 in, 45 out");

  assert.match(renderSession(view([], { activity: { kind: "working" } })), /^working · /);
});
