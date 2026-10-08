import assert from "node:assert/strict";
import { test } from "node:test";
import { replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { SessionItem, SessionView } from "../../contracts/agent/index.ts";
import { publishSessionView } from "./publish.ts";

const context = BACKGROUND_CONTEXT;

function sessionView(items: SessionItem[], busy = false): SessionView {
  return {
    items,
    status: {
      activity: busy ? { kind: "answering" } : { kind: "idle" },
      busy,
      queued: [],
      model: null,
      ownModel: false,
      usage: { input: 0, output: 0, cost: 0 },
    },
    entries: items.length,
  };
}

const answer = (text: string, streaming: boolean): SessionItem => ({
  type: "assistant",
  text,
  thinking: "",
  streaming,
  stopReason: streaming ? null : "stop",
});

test("the published view always equals the latest view, however it grew, was replaced or shrank", () => {
  const user: SessionItem = { type: "user", text: "hello" };
  const steps = [
    sessionView([user], true),
    sessionView([user, answer("Hel", true)], true),
    sessionView([user, answer("Hello there", true)], true),
    sessionView([user, answer("Hello there.", false)]),
    sessionView([user, answer("Hello there.", false), { type: "marker", marker: "reset" }]),
    sessionView([{ type: "marker", marker: "reset" }]),
    sessionView([]),
  ];
  const state = replicatedState(structuredClone(sessionView([])));
  const seen: SessionView[] = [];

  for (const next of steps) {
    publishSessionView(state, structuredClone(next), context);
    seen.push(structuredClone(state.value));
  }

  assert.deepEqual(seen, steps);
});
