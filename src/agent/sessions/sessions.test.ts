import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ConversationId, configure, LiveDoc } from "@earendil-works/pi-durable";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { openHost } from "../host/durable.ts";
import { openSession } from "../records/durable.ts";
import { fauxModels } from "../testing/index.ts";
import { createSessions, shownOf } from "./durable.ts";

const context = BACKGROUND_CONTEXT;

test("a reason the engine gives that the agent has no word for reaches a client as other, with the engine's words", { timeout: 30_000 }, async (t) => {
  const home = tempDir(t, "sessions");
  const { models, model } = fauxModels({ home, scenario: "chat", tokensPerSecond: 4000 });
  const host = await openHost({ home, models });
  stopAfter(t, () => host.close());
  const defaults = { model, cwd: home };
  const sessions = createSessions(host.harness, defaults, models);
  host.resume();
  // The engine ends a run at a session's limit of rounds of tools, which the agent sets for no session and has no word for.
  const conversationId = await host.harness.commit(async (tx) => {
    const session = await openSession(tx, defaults, { threadId: "th_1", channelId: "ch_1" });
    const id = session.conversationId as ConversationId;
    await configure(tx, id, { maxTurns: 1 });
    return id;
  }, context);

  const { submission } = await sessions.steer("th_1", "list the files", "request-1", context);
  const settled = await sessions.wait("th_1", submission, context);
  const view = await sessions.view("th_1")({ advance: () => undefined, end: () => undefined }, context);
  view?.detach();
  const shown = view === undefined ? undefined : shownOf(view.value, [], model);

  const engine = (await host.harness.snapshot(LiveDoc, conversationId, context))?.runFailure;
  assert.ok(engine?.detail !== undefined, "the engine said why the run ended");
  assert.ok(settled.status === "unanswered" && settled.reason === "other", JSON.stringify(settled));
  assert.ok(settled.detail?.includes(engine.reason) && settled.detail.includes(engine.detail), settled.detail ?? "no detail");
  assert.deepEqual(shown?.status?.failure, { reason: "other", detail: settled.detail }, "and the session's status says the same");
});
