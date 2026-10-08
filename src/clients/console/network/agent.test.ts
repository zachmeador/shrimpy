import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { startStandInAgent } from "../../../contracts/agent/testing/index.ts";
import type { Transports } from "../../../contracts/gateway/index.ts";
import { localTransports } from "../../../contracts/gateway/node.ts";
import { startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { stopAfter, until, useRuntimeDir, within } from "../../../lib/testing/index.ts";
import { type AgentLink, keepAgent, type SessionUpdate } from "./agent.ts";
import { Down } from "./status.ts";
import { POLL_MS, quick, startRegistry } from "./testing/index.ts";

const timeout = 15_000;

/** A link to the agent called scout, which closes when the test ends. The test needs a gateway and a runtime directory. */
function startLink(t: TestContext, transports: Transports = localTransports()) {
  const registry = startRegistry(t, { transports });
  const updates: SessionUpdate[] = [];
  const link: AgentLink = keepAgent({
    name: "scout",
    registry,
    transports,
    pollMs: POLL_MS,
    backoff: quick(),
    onSession: (update) => updates.push(update),
  });
  stopAfter(t, () => link.close());
  return { link, updates };
}

async function startAgent(t: TestContext) {
  useRuntimeDir(t);
  await startTestGateway(t);
  return startStandInAgent(t, { name: "scout" });
}

test("while the agent is not listed it says so, and it connects when the agent is", { timeout }, async (t) => {
  useRuntimeDir(t);
  await startTestGateway(t);
  const { link } = startLink(t);

  await until(() => JSON.stringify(link.status()) === JSON.stringify({ state: "down", why: { kind: "not-registered" } }), "the wait");
  await assert.rejects(link.sessions(), (error: unknown) => error instanceof Down && error.why.kind === "not-registered");
  await startStandInAgent(t, { name: "scout" });

  await until(() => link.status().state === "up", "the agent to be reached");
});

test("it reaches the agent through the transports it is handed", { timeout }, async (t) => {
  await startAgent(t);
  const local = localTransports();
  const reached: string[] = [];
  const { link } = startLink(t, {
    ...local,
    program(target, ticket) {
      reached.push(`${target.kind} ${target.name}`);
      return local.program(target, ticket);
    },
  });

  await until(() => link.status().state === "up", "the agent to be reached through them");

  assert.deepEqual(reached, ["agent scout"]);
});

test("a link whose agent went away keeps saying it was lost while it tries again", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const { link } = startLink(t);
  await until(() => link.status().state === "up", "the agent to be reached");
  const statuses: string[] = [];
  link.onStatus((status) => statuses.push(status.state === "up" ? "up" : status.why.kind));

  // The agent's registration stays, so every try finds it listed and fails to reach it.
  await stand.outage();
  await until(() => statuses.includes("lost"), "the loss to be noticed");
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 10));

  assert.deepEqual([...new Set(statuses)], ["lost"]);
  await stand.recover();
  await until(() => link.status().state === "up", "the agent to be reached again");
});

test("closing hangs up at once, even while a session is being looked for", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const { link } = startLink(t);
  await until(() => link.status().state === "up", "the agent to be reached");
  link.watch("th_none");
  await until(() => stand.agent.listings >= 2, "the link to have looked for the session more than once");

  await within(2000, link.close(), "closing");

  await until(() => stand.connections() === 0, "the connection to end");
});
