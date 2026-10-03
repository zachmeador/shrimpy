import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { attachLocal } from "../contracts/agent/node.ts";
import { HomeOwnedError } from "./host/index.ts";
import { startAgent } from "./index.ts";
import {
  answered,
  assistantItems,
  type FauxScenario,
  fauxModels,
  toolItems,
  waitForView,
} from "./testing/index.ts";

const timeout = 30_000;

function start(scenario: FauxScenario, tokensPerSecond?: number) {
  const home = mkdtempSync(join(tmpdir(), "shrimpy-agent-"));
  return startAgent({ home, ...fauxModels({ home, scenario, tokensPerSecond }) }).then((agent) => ({
    home,
    agent,
  }));
}

test("a client attaches, steers the main session, and watches the turn", { timeout }, async () => {
  const { home, agent } = await start("chat");
  const connection = await attachLocal(home);
  try {
    const sessions = await connection.sessions();
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.main, true);
    const session = await connection.attach(sessions[0].id);
    assert.deepEqual(session.view.items, []);

    const first = await session.steer("show me the files", "request-1");
    const retried = await session.steer("show me the files", "request-1");
    assert.equal(retried.submission, first.submission);

    const view = await waitForView(session, answered);
    assert.deepEqual(
      view.items.map((item) => item.type),
      ["user", "assistant", "tool", "assistant"],
    );
    assert.deepEqual(toolItems(view)[0]?.status, "done");
    assert.equal(toolItems(view)[0]?.output, "listing the work directory\ndone\n");
    assert.deepEqual(view.status.activity, { kind: "idle" });
    assert.ok(view.status.usage.output > 0);

    const second = await attachLocal(home);
    const sameSession = await second.attach(session.id);
    assert.deepEqual(sameSession.view, view);
    await second.close();
  } finally {
    await connection.close();
    await agent.close();
  }
});

test("abort stops a streaming answer and keeps what arrived", { timeout }, async () => {
  const { home, agent } = await start("stream", 40);
  const connection = await attachLocal(home);
  try {
    const session = await connection.attach((await connection.sessions())[0]?.id ?? "");
    await session.steer("stream a long answer");
    await waitForView(session, (view) => (assistantItems(view)[0]?.text.length ?? 0) > 20);

    await session.abort();

    const view = await waitForView(session, (current) => !current.status.busy);
    const answer = assistantItems(view).at(-1);
    assert.equal(answer?.stopReason, "aborted");
    assert.ok(answer.text.startsWith("line 01"));
  } finally {
    await connection.close();
    await agent.close();
  }
});

test("a second agent cannot take a home that has an owner", { timeout }, async () => {
  const { home, agent } = await start("chat");
  try {
    await assert.rejects(
      startAgent({ home, ...fauxModels({ home, scenario: "chat" }) }),
      HomeOwnedError,
    );
  } finally {
    await agent.close();
  }
});

test("an unknown session is refused", { timeout }, async () => {
  const { home, agent } = await start("chat");
  const connection = await attachLocal(home);
  try {
    await assert.rejects(connection.attach("999"));
    await assert.rejects(connection.attach("not-a-session"));
  } finally {
    await connection.close();
    await agent.close();
  }
});
