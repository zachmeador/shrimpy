import assert from "node:assert/strict";
import { test } from "node:test";
import { attachLocal } from "../contracts/agent/node.ts";
import { leaveUnanswered, settle } from "../lib/testing/index.ts";
import { startAgentRig } from "./testing/index.ts";

const timeout = 30_000;

test("a client that is gone before the agent's answer reaches it is not reported", { timeout }, async (t) => {
  const reported = t.mock.method(console, "error", () => undefined);
  const rig = await startAgentRig(t);

  await leaveUnanswered(rig.agent.endpoint.socket);
  // By the time the agent has answered this one, it is done with the one that left.
  const client = await attachLocal(rig.home);
  await client.sessions();
  await client.close();
  await settle();

  assert.deepEqual(reported.mock.calls.map((call) => call.arguments), []);
  assert.deepEqual(rig.reports, []);
});
