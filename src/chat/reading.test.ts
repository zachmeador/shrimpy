import assert from "node:assert/strict";
import { test } from "node:test";
import { READ_ONLY } from "../contracts/chat/index.ts";
import { isRefusal, reasonOf } from "../lib/refusal/index.ts";
import { waitForView } from "../lib/testing/index.ts";
import { mainThread, outcome, posted, startTestChat, texts } from "./testing/index.ts";

const timeout = 30_000;
const THUMBS_UP = "\u{1F44D}";

test("a person is shown and reads the DMs and rooms of agents they are not in, as they stand and as they happen, and writes in none until they add themselves to a room", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  // The first agent a roster has is an admin.
  const scout = await chat.agent("scout");
  const maya = await chat.agent("maya");

  // Two agents talk in a DM: a question, its answer, an edit, a reaction and a receipt.
  const dm = await scout.chat.openDm(maya.me.id);
  const main = await mainThread(scout, dm.id);
  const question = await scout.chat.post(main.id, "Is the disk full?", "scout-1");
  const answer = await maya.chat.post(main.id, "Nearly.", "maya-1");
  await maya.chat.edit(answer.id, "Nearly: 91%.");
  await scout.chat.react(answer.id, THUMBS_UP);
  await maya.chat.leaveReceipt([question.event], outcome("answered", { reply: answer.id }));

  // The person is shown it apart from their own channels, which it is not one of.
  assert.deepEqual(await zach.chat.channels(), []);
  const [shown, ...more] = await zach.chat.readOnlyChannels();
  assert.deepEqual(more, []);
  assert.deepEqual([shown?.id, shown?.kind], [dm.id, "dm"]);
  assert.deepEqual(shown?.members.map((member) => member.id).sort(), [scout.me.id, maya.me.id].sort());

  // They read it as a member does: the messages as they now stand, with the edit, the reaction and the receipt.
  assert.deepEqual((await zach.chat.threads(dm.id)).map((thread) => thread.id), [main.id]);
  const read = await zach.chat.read(main.id, null, 10);
  assert.deepEqual(read, await scout.chat.read(main.id, null, 10));
  assert.deepEqual(texts(read), ["Is the disk full?", "Nearly: 91%."]);
  assert.deepEqual(read[1]?.reactions.map((reaction) => reaction.emoji), [THUMBS_UP]);
  assert.deepEqual(read[0]?.receipts.map((receipt) => receipt.status), ["answered"]);

  // And follow it as it happens, with who is working in it.
  const watching = await zach.attach(main.id);
  assert.deepEqual(texts(watching.view.messages), ["Is the disk full?", "Nearly: 91%."]);
  await maya.chat.setWorking(main.id, true);
  await scout.chat.post(main.id, "Thanks.", "scout-2");
  const live = await waitForView(watching, (view) => view.messages.length === 3 && view.thread.working.length === 1);
  assert.deepEqual(live.thread.working.map((mark) => mark.memberId), [maya.me.id]);

  // Nothing there reaches their feed: once they have a channel of their own, that is all it carries.
  const own = await zach.chat.openDm(scout.me.id);
  await zach.chat.post((await mainThread(zach, own.id)).id, "Hello, scout.", "zach-1");
  assert.deepEqual(posted(await zach.chat.feed(0, 100)), ["Hello, scout."]);

  // A room of agents is shown the same way.
  const room = await scout.chat.createRoom("Ops", [maya.me.id]);
  const roomMain = await mainThread(scout, room.id);
  await maya.chat.post(roomMain.id, "Disk is at 91%.", "maya-2");
  assert.deepEqual((await zach.chat.readOnlyChannels()).map((channel) => channel.id), [dm.id, room.id]);
  assert.deepEqual(texts(await zach.chat.read(roomMain.id, null, 10)), ["Disk is at 91%."]);

  // They are in neither, so every write is refused for that reason, and nothing changes.
  const before = [await zach.chat.read(main.id, null, 10), await zach.chat.threads(dm.id), await zach.chat.read(roomMain.id, null, 10)];
  const refused: [string, () => Promise<unknown>][] = [
    ["post", () => zach.chat.post(main.id, "Can I join?", "zach-2")],
    ["edit", () => zach.chat.edit(answer.id, "Mine now.")],
    ["delete", () => zach.chat.delete(answer.id)],
    ["react", () => zach.chat.react(answer.id, THUMBS_UP)],
    ["unreact", () => zach.chat.unreact(answer.id, THUMBS_UP)],
    ["setWorking", () => zach.chat.setWorking(main.id, true)],
    ["createThread", () => zach.chat.createThread(dm.id, "Mine")],
    ["renameThread", () => zach.chat.renameThread(main.id, "Mine")],
    ["archiveThread", () => zach.chat.archiveThread(main.id, true)],
    ["post in the room", () => zach.chat.post(roomMain.id, "Can I join?", "zach-3")],
  ];
  for (const [what, call] of refused) await assert.rejects(call(), (error) => reasonOf(error) === READ_ONLY, what);
  await assert.rejects(zach.chat.leaveReceipt([question.event], outcome("silent")), isRefusal, "a person leaves no receipt");
  await assert.rejects(zach.chat.addMembers(dm.id, [zach.me.id]), isRefusal, "a DM has two members and takes no more");
  assert.deepEqual([await zach.chat.read(main.id, null, 10), await zach.chat.threads(dm.id), await zach.chat.read(roomMain.id, null, 10)], before);

  // They add themselves to the room, and it is theirs from then on.
  await zach.chat.addMembers(room.id, [zach.me.id]);
  assert.deepEqual((await zach.chat.channels()).map((channel) => channel.id), [own.id, room.id]);
  assert.deepEqual((await zach.chat.readOnlyChannels()).map((channel) => channel.id), [dm.id]);
  await zach.chat.post(roomMain.id, "Thanks for the update.", "zach-4");
  assert.deepEqual(texts(await maya.chat.read(roomMain.id, null, 10)), ["Disk is at 91%.", "Thanks for the update."]);
});
