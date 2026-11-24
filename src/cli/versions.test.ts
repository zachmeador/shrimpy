import assert from "node:assert/strict";
import { test } from "node:test";
import { servingAnotherAgent } from "../contracts/agent/testing/index.ts";
import { linkTestAgent } from "../contracts/gateway/testing/index.ts";
import { within } from "../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { shrimpy, startTalking } from "./testing/index.ts";

/*
 * What the commands say when an agent they reach serves another version of what they ask of it. Every `shrimpy` is its
 * own process, and so are the gateway and the chat server. The agent is a stand-in that serves another build's object.
 */

const timeout = 60_000;

test("a command on an agent that serves another version of it says so at once, naming the agent and the Shrimpy it runs", { timeout }, async (t) => {
  await startTalking(t);
  await linkTestAgent(t, "scout", { serving: servingAnotherAgent });

  const result = await within(15_000, shrimpy(["sessions", "list", "--agent", "scout"]), "the command to give up well before Chord's minute");
  assert.equal(result.code, 1, result.stdout);
  assert.ok(result.stderr.includes("scout") && result.stderr.includes(SHRIMPY_VERSION), result.stderr);
});
