import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parseWake } from "../agent/index.ts";
import { AGENT_HOME_VARIABLE } from "../contracts/agent/index.ts";
import { memberNamed } from "../contracts/chat/testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { tempDir, useRuntimeDir } from "../lib/testing/index.ts";
import { declareLocalModel, serve, serveChat, shrimpy, startModelServer, untilRegistered, useShrimpyDir } from "./testing/index.ts";

/*
 * `shrimpy wake` as people and agents run it: every command is its own process, and so are the gateway, the chat
 * server and the agent, which a stand-in model serves.
 */

const timeout = 90_000;

test("wake chooses what wakes an agent in a room, checks the room when the agent runs it, tells the agent, and lists what is set", { timeout }, async (t) => {
  useRuntimeDir(t);
  const model = await startModelServer();
  t.after(() => model.close());
  await startTestGateway(t);
  await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  assert.equal((await shrimpy(["agent", "init", "scout", "--model", "local/test-model"])).code, 0);
  const home = join(useShrimpyDir(t), "agents", "scout");
  declareLocalModel(home, { url: model.url, model: "test-model" });
  await serve(t, home);
  // Making a room takes an admin, which the first agent a roster has is, once it has joined.
  await memberNamed(t, "scout");
  const inShell = { env: { [AGENT_HOME_VARIABLE]: home } };
  const elsewhere = { env: { [AGENT_HOME_VARIABLE]: "" } };
  const file = join(home, "wake.json");
  const chosen = (): unknown => parseWake(readFileSync(file, "utf8"), file);
  assert.equal((await shrimpy(["rooms", "new", "Ops"], inShell)).code, 0, "the agent makes a room, so it is in it");

  const nothing = await shrimpy(["wake"], inShell);
  assert.equal(nothing.code, 0, nothing.stderr);
  assert.match(nothing.stdout, /No room is set/);
  assert.equal(existsSync(file), false);

  // In the agent's shell the room is checked, and written as chat has its name, in any case it was typed. The agent is told.
  const set = await shrimpy(["wake", "#ops", "all"], inShell);
  assert.equal(set.code, 0, set.stderr);
  assert.deepEqual(chosen(), { Ops: "all" });
  assert.match(set.stdout, /Told the agent to read its files again/);
  const listed = await shrimpy(["wake"], inShell);
  assert.match(listed.stdout, /#Ops +all/);

  // A room the agent is not in, and a policy that is not one, are refused, and nothing is written.
  const missing = await shrimpy(["wake", "#nowhere", "none"], inShell);
  assert.equal(missing.code, 2);
  assert.match(missing.stderr, /not in a room called #nowhere\. The rooms you are in: #Ops\./);
  const wrong = await shrimpy(["wake", "ops", "loud"], inShell);
  assert.equal(wrong.code, 2);
  assert.match(wrong.stderr, /none, mentions, people or all/);
  assert.deepEqual(chosen(), { Ops: "all" });

  // Anywhere else it takes --agent when the folder has more than one agent, can't say which rooms the agent is in, and writes the room as it was written.
  assert.equal((await shrimpy(["agent", "init", "rex", "--model", "local/test-model"])).code, 0);
  const unaimed = await shrimpy(["wake", "Ops", "mentions"], elsewhere);
  assert.equal(unaimed.code, 2);
  assert.ok(unaimed.stderr.includes("--agent"), unaimed.stderr);
  const unchecked = await shrimpy(["wake", "ghost", "none", "--agent", "scout"], elsewhere);
  assert.equal(unchecked.code, 0, unchecked.stderr);
  assert.match(unchecked.stdout, /was not checked/);
  assert.deepEqual(chosen(), { Ops: "all", ghost: "none" });
});
