import assert from "node:assert/strict";
import { test } from "node:test";
import { NEEDS_ADMIN } from "../contracts/gateway/index.ts";
import { isRefusal, reasonOf } from "../lib/refusal/index.ts";
import { mainThread, posted, startTestChat, texts } from "./testing/index.ts";

const timeout = 30_000;

/** The members a message mentions, by name, in alphabetical order. */
const mentioned = (message: { mentions: string[] }, names: Map<string, string>): string[] =>
  message.mentions.map((id) => names.get(id) ?? id).sort();

test("a room is made with the members it names, an admin who is in it can add more, and only members see it, read it or post in it", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const alice = await chat.agent("alice");

  const room = await zach.chat.createRoom("Ops", [scout.me.id, zach.me.id, scout.me.id]);

  assert.deepEqual([room.kind, room.name], ["room", "Ops"]);
  assert.deepEqual(room.members.map((member) => member.id).sort(), [zach.me.id, scout.me.id].sort(), "the maker is the first member, and counts once");
  assert.deepEqual(await scout.chat.channels(), [room]);
  const main = await mainThread(zach, room.id);
  assert.equal(main.main, true);
  const side = await scout.chat.createThread(room.id, "Disk");
  await zach.chat.post(side.id, "Which disk?", "zach-1");

  // A name is unique among rooms whatever the case, and a call that names someone who is not on the roster makes nothing.
  await assert.rejects(zach.chat.createRoom("OPS", []), { code: "service_invalid_value", message: /room called "OPS" already/ });
  await assert.rejects(zach.chat.createRoom("Other", ["mem_nobody"]), { message: /There is no member mem_nobody on the roster/ });
  assert.deepEqual((await zach.chat.channels()).map((channel) => channel.name), ["Ops"]);

  // Someone who is not in it can't see it, read it, post in it or add anyone, and is told nothing about it.
  const refused: [string, () => Promise<unknown>][] = [
    ["threads", () => alice.chat.threads(room.id)],
    ["read", () => alice.chat.read(main.id, null, 10)],
    ["post", () => alice.chat.post(main.id, "let me in", "alice-1")],
    ["attach", () => alice.attach(main.id)],
    ["addMembers", () => alice.chat.addMembers(room.id, [alice.me.id])],
  ];
  for (const [what, call] of refused) await assert.rejects(call(), { message: /^Unknown (channel|thread): /u }, what);

  // An admin who is in the room can add anyone on the roster, and a member added sees the whole room, its history included.
  const added = await zach.chat.addMembers(room.id, [maya.me.id, scout.me.id]);
  assert.deepEqual(added.members.map((member) => member.id).sort(), [zach.me.id, scout.me.id, maya.me.id].sort());
  assert.deepEqual((await maya.chat.channels()).map((channel) => channel.id), [room.id]);
  assert.deepEqual(texts(await maya.chat.read(side.id, null, 10)), ["Which disk?"]);
  assert.deepEqual((await maya.chat.threads(room.id)).map((thread) => thread.id).sort(), [main.id, side.id].sort());
  const dm = await zach.chat.openDm(maya.me.id);
  await assert.rejects(zach.chat.addMembers(dm.id, [scout.me.id]), { message: /DM has two members/ });
});

test("a post in a room mentions the members its text names, or everyone but its author with @all, and an edit works that out again", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  await chat.agent("rex");
  const names = new Map([zach, scout, maya].map((member) => [member.me.id, member.me.name]));
  const room = await zach.chat.createRoom("Ops", [scout.me.id, maya.me.id]);
  const main = await mainThread(zach, room.id);
  let number = 0;
  const say = (text: string) => zach.chat.post(main.id, text, `zach-${++number}`);

  assert.deepEqual(mentioned(await say("@scout, can you look?"), names), ["scout"]);
  assert.deepEqual(mentioned(await say("@MAYA and @Scout: both of you."), names), ["maya", "scout"], "in any case");
  assert.deepEqual(mentioned(await say("Everyone: @all"), names), ["maya", "scout"], "but not its author");
  assert.deepEqual(mentioned(await say(`@${zach.me.name} asked me to tell you`), names), [], "and not its author, who mentions themself");
  assert.deepEqual(mentioned(await say("@rex, are you there?"), names), [], "a name that is no member's mentions nobody");
  assert.deepEqual(mentioned(await say("Write to me@scout or ask @scoutmaster"), names), [], "only a name on its own is a mention");
  assert.deepEqual(mentioned(await say("Thanks, @scout."), names), ["scout"], "and a full stop after it ends the sentence");
  assert.deepEqual(mentioned(await say("No one in particular."), names), []);

  // An edit mentions whoever its new text names, and the event that carries it says so.
  const message = await say("@scout first");
  const head = await maya.chat.head();
  assert.deepEqual(mentioned(await zach.chat.edit(message.id, "@maya instead of scout"), names), ["maya"]);
  const [edit] = await maya.chat.feed(head, 10);
  assert.ok(edit?.kind === "edited");
  assert.deepEqual(mentioned(edit.message, names), ["maya"]);
  assert.deepEqual(mentioned(await zach.chat.edit(message.id, "no one at all"), names), []);
});

test("in a DM a message mentions the other member only when its text names them, and in a room @all mentions everyone but its author", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const names = new Map([zach, scout, maya].map((member) => [member.me.id, member.me.name]));
  const dm = await zach.chat.openDm(scout.me.id);
  const room = await zach.chat.createRoom("Ops", [scout.me.id, maya.me.id]);
  let number = 0;
  const say = async (channelId: string, text: string) => zach.chat.post((await mainThread(zach, channelId)).id, text, `zach-${++number}`);

  assert.deepEqual(mentioned(await say(dm.id, "hello"), names), [], "a DM message that names nobody mentions nobody");
  assert.deepEqual(mentioned(await say(dm.id, "@scout stop that"), names), ["scout"], "one that names the other member mentions them");
  assert.deepEqual(mentioned(await say(dm.id, "@all hello"), names), ["scout"], "and @all is everyone there but the author");
  assert.deepEqual(mentioned(await say(room.id, "@all hello"), names), ["maya", "scout"], "as it is in a room");
});

test("a member added to a room is offered what comes after, never what came before, though the room's thread shows it all", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const room = await zach.chat.createRoom("Ops", [scout.me.id]);
  const main = await mainThread(zach, room.id);
  await zach.chat.post(main.id, "before", "zach-1");
  const waiting = maya.chat.feed(await maya.chat.head(), 10);
  // The server takes up a connection's calls in order, so once it has answered this one it has the feed.
  await maya.chat.head();

  await zach.chat.addMembers(room.id, [maya.me.id]);
  await zach.chat.post(main.id, "after", "zach-2");

  assert.deepEqual(posted(await waiting), ["after"], "a feed that was waiting when she was added gets only what came after");
  assert.deepEqual(posted(await maya.chat.feed(0, 10)), ["after"], "and so does one that starts from the beginning");
  assert.deepEqual(texts(await maya.chat.read(main.id, null, 10)), ["before", "after"]);
  assert.deepEqual(posted(await scout.chat.feed(0, 10)), ["before", "after"], "while a member from the start is offered it all");
});

test("making a room and adding members take an admin, which a person is and an agent is once promoted, with nothing restarted", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");
  const rex = await chat.agent("rex");
  const needsAdmin = (error: unknown): boolean => isRefusal(error) && reasonOf(error) === NEEDS_ADMIN;
  // The person is the admin there is, so the refusal names them for whoever has to ask.
  const asksTheAdmin = (error: unknown): boolean => needsAdmin(error) && (error as Error).message.includes(zach.me.name);

  // A person is an admin, and makes a room and adds to it.
  const ops = await zach.chat.createRoom("Ops", [scout.me.id]);
  assert.equal((await zach.chat.addMembers(ops.id, [maya.me.id])).members.length, 3);

  // An agent that is not is refused both, even in a room it is in, and the refusal says why in a way that can be told without reading it.
  await assert.rejects(scout.chat.createRoom("Mine", [rex.me.id]), asksTheAdmin);
  await assert.rejects(scout.chat.addMembers(ops.id, [rex.me.id]), asksTheAdmin);
  assert.deepEqual((await scout.chat.channels()).map((channel) => channel.name), ["Ops"], "nothing was made and nobody was added");
  assert.deepEqual((await zach.chat.channels()).map((channel) => channel.name), ["Ops"]);

  // Promoted at the gateway, the same connection may: the chat server asks the roster each time, not once when it came in.
  await chat.setAdmin(scout.me, true);
  const mine = await scout.chat.createRoom("Mine", [rex.me.id]);
  assert.deepEqual(mine.members.map((member) => member.name).sort(), ["rex", "scout"]);
  assert.equal((await scout.chat.addMembers(ops.id, [rex.me.id])).members.length, 4);

  // And demoted, it may not again.
  await chat.setAdmin(scout.me, false);
  await assert.rejects(scout.chat.createRoom("Theirs", []), needsAdmin);
  await assert.rejects(scout.chat.addMembers(mine.id, [maya.me.id]), needsAdmin);
});
