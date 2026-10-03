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

/** Publish each view in turn, and return what subscribers saw after each one. */
function publishAll(first: SessionView, rest: SessionView[]): SessionView[] {
  const state = replicatedState(structuredClone(first));
  const seen: SessionView[] = [];
  for (const next of rest) {
    publishSessionView(state, structuredClone(next), context);
    seen.push(structuredClone(state.value));
  }
  return seen;
}

test("the published view always equals the latest view", () => {
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

  assert.deepEqual(publishAll(sessionView([]), steps), steps);
});

test("an item that changes type is replaced", () => {
  const steps = [sessionView([{ type: "marker", marker: "compaction" }])];
  assert.deepEqual(publishAll(sessionView([{ type: "user", text: "hi" }]), steps), steps);
});

test("publishing the same view again makes no new revision", () => {
  const state = replicatedState(sessionView([{ type: "user", text: "hi" }]));
  let revisions = 0;
  state.subscribe(() => {
    revisions += 1;
  });
  const before = revisions;

  publishSessionView(state, sessionView([{ type: "user", text: "hi" }]), context);

  assert.equal(revisions, before);
});
