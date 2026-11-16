import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { AGENT_HOME_VARIABLE, parseWake } from "../contracts/agent/index.ts";
import { memberNamed, startTestChat } from "../contracts/chat/testing/index.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { useRuntimeDir } from "../lib/testing/index.ts";
import { declareLocalModel, serve, shrimpy, startModelServer, untilLinked, useShrimpyDir } from "./testing/index.ts";

/*
 * `shrimpy wake` as people and agents run it: every command is its own process, and so are the gateway, the chat
 * server and the agent, which a stand-in model serves.
 */

const timeout = 90_000;

test("wake chooses what wakes an agent in a room, and lists what is set", { timeout }, async (t) => {
  useRuntimeDir(t);
  const model = await startModelServer(t);
  await startTestGateway(t);
  await startTestChat(t);
  await untilLinked("chat", "chat");
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
  assert.equal(existsSync(file), false);

  // In the agent's shell the room is checked, and written as chat has its name, in any case it was typed.
  const set = await shrimpy(["wake", "#ops", "all"], inShell);
  assert.equal(set.code, 0, set.stderr);
  assert.deepEqual(chosen(), { Ops: "all" });
  const listed = await shrimpy(["wake"], inShell);
  assert.ok(listed.stdout.split("\n").some((line) => line.includes("#Ops") && line.includes("all")), listed.stdout);

  // A room the agent is not in, and a policy that is not one, are refused, and nothing is written.
  const missing = await shrimpy(["wake", "#nowhere", "none"], inShell);
  assert.equal(missing.code, 2);
  assert.ok(missing.stderr.includes("#Ops"), "it names the rooms the agent is in");
  const wrong = await shrimpy(["wake", "ops", "loud"], inShell);
  assert.equal(wrong.code, 2);
  assert.ok(["none", "mentions", "people", "all"].every((policy) => wrong.stderr.includes(policy)), "it names the policies there are");
  assert.deepEqual(chosen(), { Ops: "all" });

  // Anywhere else it takes --agent when the folder has more than one agent, can't say which rooms the agent is in, and writes the room as it was written.
  assert.equal((await shrimpy(["agent", "init", "rex", "--model", "local/test-model"])).code, 0);
  const unaimed = await shrimpy(["wake", "Ops", "mentions"], elsewhere);
  assert.equal(unaimed.code, 2);
  assert.ok(unaimed.stderr.includes("--agent"), unaimed.stderr);
  const unchecked = await shrimpy(["wake", "ghost", "none", "--agent", "scout"], elsewhere);
  assert.equal(unchecked.code, 0, unchecked.stderr);
  assert.deepEqual(chosen(), { Ops: "all", ghost: "none" });
});
