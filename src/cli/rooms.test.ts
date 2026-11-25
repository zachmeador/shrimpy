import assert from "node:assert/strict";
import { test } from "node:test";
import type { Thread } from "../contracts/chat/index.ts";
import { joinRoster } from "../contracts/chat/testing/index.ts";
import { shrimpy, startAgentShell, startScriptedAgent, startTalking } from "./testing/index.ts";

/*
 * These tests make and use rooms with the commands, as people do: every
 * `shrimpy` is its own process, and so are the gateway and the chat server. The
 * members of a room only have to be on the roster.
 */

const timeout = 60_000;

test("an admin agent makes a room from its shell, adds the person, and both list and read it", { timeout }, async (t) => {
  const talking = await startTalking(t);
  const you = await talking.you();
  await startScriptedAgent(t, { name: "scout", handle: () => ({ status: "silent" }) });
  await joinRoster(t, "maya");
  const rex = await startAgentShell(t, "rex", { admin: true });

  // The agent makes it, so it is the agent that is in it, and the person has to be added to see it.
  const made = await rex.run(["rooms", "new", "ops", "scout"]);
  assert.equal(made.code, 0, made.stderr);
  assert.deepEqual(await you.channels(), []);
  assert.equal((await shrimpy(["threads", "#ops"])).code, 1);

  // A member adds anyone on the roster, in any case, and one who is in already is said to be.
  const added = await rex.run(["rooms", "add", "#OPS", "MAYA", you.me.name, "scout"]);
  assert.equal(added.code, 0, added.stderr);
  const [room] = await you.channels();
  assert.ok(room);
  assert.deepEqual([room.kind, room.name], ["room", "ops"]);
  assert.deepEqual(
    room.members.map((member) => member.name).sort(),
    [you.me.name, "maya", "rex", "scout"].sort(),
  );

  // Now the person sees it, and its threads.
  const [main] = await you.threads(room.id);
  assert.ok(main);
  assert.ok((await shrimpy(["rooms"])).stdout.includes("#ops"));
  await you.post(main.id, "Is the disk full?", "you-1");
  const side = await you.createThread(room.id, "Backups");
  await you.post(side.id, "Last night's run?", "you-2");
  const threads = await shrimpy(["threads", "#ops", "--json"]);
  assert.equal(threads.code, 0, threads.stderr);
  assert.deepEqual(
    (JSON.parse(threads.stdout) as Thread[]).map((thread) => [thread.id, thread.name, thread.pinned !== null]),
    [
      [main.id, null, true],
      [side.id, "Backups", false],
    ],
    "the room's pinned thread first, though the other is newer",
  );
  assert.equal((await rex.run(["threads", "#Ops"])).code, 0, "the agent lists them as itself");

  // A room's thread is read like any other. A command that talks to an agent in your DM with it takes no thread of a room.
  const read = await shrimpy(["read", main.id]);
  assert.equal(read.code, 0, read.stderr);
  assert.ok(read.stdout.includes("#ops") && read.stdout.includes("Is the disk full?"), read.stdout);
  const spoken = await shrimpy(["run", "scout", "hello", "--thread", main.id]);
  assert.equal(spoken.code, 1);
  assert.equal((await you.read(main.id, null, 10)).length, 1, "and posted nothing");
});

test("a room is made or added to only when every name is right, and the error names the wrong ones", { timeout }, async (t) => {
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
  assert.ok(nobody.stderr.includes("nobody") && nobody.stderr.includes("noone"), nobody.stderr);
  assert.equal(taken.code, 1);
  assert.equal(add.code, 1);
  assert.ok(add.stderr.includes("nobody"), add.stderr);
  assert.equal(elsewhere.code, 1);
  assert.ok(elsewhere.stderr.includes("#nowhere") && elsewhere.stderr.includes("#ops"), "it names the room, and the rooms you are in");
  assert.deepEqual([none.code, nobodyToAdd.code], [2, 2], "a command used wrongly says so");
  const rooms = await you.channels();
  assert.deepEqual(
    rooms.map((room) => [room.name, room.members.map((member) => member.name).sort()]),
    [["ops", [you.me.name, "scout"].sort()]],
    "no other room was made, and nobody was added to this one",
  );
});
