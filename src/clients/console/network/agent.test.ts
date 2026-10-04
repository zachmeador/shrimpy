import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { startStandInAgent } from "../../../contracts/agent/testing/index.ts";
import { startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { stopAfter, until, useRuntimeDir, within } from "../../../lib/testing/index.ts";
import { type AgentLink, keepAgent, type SessionUpdate } from "./agent.ts";
import { Down } from "./status.ts";
import { POLL_MS, quick, startRegistry } from "./testing/index.ts";
import { localTransports, type Transports } from "./transports.ts";

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
  await assert.rejects(link.stop(), (error: unknown) => error instanceof Down && error.why.kind === "not-registered");
  await startStandInAgent(t, { name: "scout" });

  await until(() => link.status().state === "up", "the agent to be reached");
});

test("it reaches the agent through the transports it is handed", { timeout }, async (t) => {
  await startAgent(t);
  const local = localTransports();
  const reached: string[] = [];
  const { link } = startLink(t, {
    ...local,
    program(registration) {
      reached.push(`${registration.kind} ${registration.name}`);
      return local.program(registration);
    },
  });

  await until(() => link.status().state === "up", "the agent to be reached through them");

  assert.deepEqual(reached, ["agent scout"]);
});

test("closing hangs up at once, even while a session is being looked for", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const { link } = startLink(t);
  await until(() => link.status().state === "up", "the agent to be reached");
  link.watch("th_none");
  await new Promise((resolve) => setTimeout(resolve, POLL_MS * 2));

  await within(2000, link.close(), "closing");

  await until(() => stand.connections() === 0, "the connection to end");
});
