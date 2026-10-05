import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { AGENT_HOME_VARIABLE } from "../contracts/agent/index.ts";
import { saveMembership } from "../contracts/agent/node.ts";
import type { Thread } from "../contracts/chat/index.ts";
import { joinRoster } from "../contracts/chat/testing/index.ts";
import { newToken } from "../contracts/gateway/node.ts";
import { startTestGateway } from "../contracts/gateway/testing/index.ts";
import { tempDir } from "../lib/testing/index.ts";
import { type CliResult, shrimpy, startScriptedAgent, startTalking } from "./testing/index.ts";

/*
 * These tests make and use rooms with the commands, as people do: every
 * `shrimpy` is its own process, and so are the gateway and the chat server. The
 * members of a room only have to be on the roster.
 */

const timeout = 60_000;

/**
 * `shrimpy` as an agent's shell runs it: the agent has joined the roster with a
 * token of its own, which its home keeps, and the command acts with it.
 */
async function shellOf(t: TestContext, name: string): Promise<(args: string[]) => Promise<CliResult>> {
  const gateway = await (await startTestGateway(t)).connect();
  const token = newToken();
  await gateway.join(name, token);
  const home = tempDir(t, `${name}-home`);
  saveMembership(home, { token });
  return (args) => shrimpy(args, { env: { [AGENT_HOME_VARIABLE]: home } });
}

test("an agent makes a room from its shell and the person is added to it, then both list it and its threads, and read it", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const you = await talking.you();
  await startScriptedAgent(t, { name: "scout", handle: () => ({ status: "silent" }) });
  await joinRoster(t, "maya");
  const rex = await shellOf(t, "rex");

  // The agent makes it, so it is the agent that is in it, and the person has to be added to see it.
  const made = await rex(["rooms", "new", "ops", "scout"]);
  assert.equal(made.code, 0, made.stderr);
  assert.deepEqual(
    (await shrimpy(["rooms"])).stdout.trim(),
    "You are in no rooms. Make one with: shrimpy rooms new <name> [<member>...]",
  );
  const blind = await shrimpy(["threads", "#ops"]);
  assert.equal(blind.code, 1);
  assert.match(blind.stderr, /You are not in a room called #ops/);

  // A member adds anyone on the roster, in any case, and one who is in already is said to be.
  const added = await rex(["rooms", "add", "#OPS", "MAYA", you.me.name, "scout"]);
  assert.equal(added.code, 0, added.stderr);
  assert.match(added.stdout, /Added .* to #ops\. scout was in it already\./);
  const [room] = await you.chat.channels();
  assert.ok(room);
  assert.deepEqual([room.kind, room.name], ["room", "ops"]);
  assert.deepEqual(
    room.members.map((member) => member.name).sort(),
    [you.me.name, "maya", "rex", "scout"].sort(),
  );

  // Now the person sees it, with its members and when it was updated, and its threads.
  const listed = (await shrimpy(["rooms"])).stdout.trim().split("\n");
  assert.equal(listed.length, 2);
  assert.match(listed[1] ?? "", /^#ops +\d{4}-\d{2}-\d{2} \d{2}:\d{2} +maya, rex, scout/i);
  const [main] = await you.chat.threads(room.id);
  assert.ok(main);
  await you.chat.post(main.id, "Is the disk full?", "you-1");
  const side = await you.chat.createThread(room.id, "Backups");
  await you.chat.post(side.id, "Last night's run?", "you-2");
  const threads = await shrimpy(["threads", "#ops", "--json"]);
  assert.equal(threads.code, 0, threads.stderr);
  assert.deepEqual(
    (JSON.parse(threads.stdout) as Thread[]).map((thread) => [thread.id, thread.name, thread.main]),
    [
      [side.id, "Backups", false],
      [main.id, null, true],
    ],
  );
  assert.equal((await rex(["threads", "#Ops"])).code, 0, "the agent lists them as itself");

  // A room's thread is read like any other. A command that talks to an agent in your DM with it takes no thread of a room.
  const read = await shrimpy(["read", main.id]);
  assert.equal(read.code, 0, read.stderr);
  assert.match(read.stdout, /^Thread th_\w+ in the room #ops:/);
  assert.ok(read.stdout.includes("Is the disk full?"));
  const spoken = await shrimpy(["run", "scout", "hello", "--thread", main.id]);
  assert.equal(spoken.code, 1);
  assert.match(spoken.stderr, /There is no thread .* in your DM with scout/);
  assert.equal((await you.chat.read(main.id, null, 10)).length, 1, "and posted nothing");
});

test("a room is made or added to only when every name is right, and the error says which name is wrong", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const you = await talking.you();
  await joinRoster(t, "scout");
  await joinRoster(t, "maya");
  assert.equal((await shrimpy(["rooms", "new", "ops", "scout"])).code, 0);

  const nobody = await shrimpy(["rooms", "new", "other", "scout", "nobody", "maya", "noone"]);
  const taken = await shrimpy(["rooms", "new", "OPS"]);
  const add = await shrimpy(["rooms", "add", "ops", "maya", "nobody"]);
  const elsewhere = await shrimpy(["rooms", "add", "nowhere", "maya"]);
  const none = await shrimpy(["rooms", "new"]);
  const nobodyToAdd = await shrimpy(["rooms", "add", "ops"]);

  assert.equal(nobody.code, 1);
  assert.ok(nobody.stderr.includes("nobody or noone"), nobody.stderr);
  assert.ok(!nobody.stderr.includes("scout is not") && !nobody.stderr.includes("maya is not"), "and not the names that were right");
  assert.equal(taken.code, 1);
  assert.match(taken.stderr, /room called "OPS" already/);
  assert.equal(add.code, 1);
  assert.ok(add.stderr.includes("nobody"), add.stderr);
  assert.equal(elsewhere.code, 1);
  assert.match(elsewhere.stderr, /not in a room called #nowhere. The rooms you are in: #ops/);
  assert.deepEqual([none.code, nobodyToAdd.code], [2, 2], "a command used wrongly says so");
  const rooms = await you.chat.channels();
  assert.deepEqual(
    rooms.map((room) => [room.name, room.members.map((member) => member.name).sort()]),
    [["ops", [you.me.name, "scout"].sort()]],
    "no other room was made, and nobody was added to this one",
  );
});
