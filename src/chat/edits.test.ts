import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForView } from "../lib/testing/index.ts";
import { logOf, startDm } from "./testing/index.ts";

const timeout = 30_000;

const THUMBS_UP = "\u{1F44D}";
const PARTY = "\u{1F389}";
// A heart is an emoji with a bare form and a longer one, which chat keeps as one reaction.
const HEART = "\u2764\uFE0F";

test("only the author can edit or delete a message, and only a member of its channel can react to it", { timeout }, async (t) => {
  const { chat, zach, shrimpy, main } = await startDm(t);
  const alice = await chat.agent("Alice");
  const said = await zach.chat.post(main.id, "Mine.", "zach-1");

  // Another member of the channel may react, and may not change what is not theirs.
  await assert.rejects(shrimpy.chat.edit(said.id, "Not yours."), {
    code: "service_invalid_value",
    message: /^Only the author of a message can edit it/,
  });
  await assert.rejects(shrimpy.chat.delete(said.id), { message: /^Only the author of a message can delete it/ });
  const reacted = await shrimpy.chat.react(said.id, THUMBS_UP);
  assert.deepEqual(reacted.reactions, [{ emoji: THUMBS_UP, memberIds: [shrimpy.me.id] }]);

  // Someone outside the channel can do nothing: for them the message is not there.
  const outside = [
    () => alice.chat.edit(said.id, "Not yours."),
    () => alice.chat.delete(said.id),
    () => alice.chat.react(said.id, THUMBS_UP),
    () => alice.chat.unreact(said.id, THUMBS_UP),
  ];
  for (const call of outside) await assert.rejects(call(), { message: /^Unknown message: msg_/ });

  // The author can, and the calls that were refused left nothing in the log.
  await zach.chat.edit(said.id, "Mine, edited.");
  assert.deepEqual(logOf(await zach.chat.feed(0, 50)), ["posted: Mine.", `reacted: ${THUMBS_UP}`, "edited: Mine, edited."]);
  await zach.chat.delete(said.id);
  assert.equal((await zach.chat.read(main.id, null, 10))[0]?.deleted, true);
});

test("a retry of a post, an edit, a delete, a reaction or taking one back changes nothing and adds no event", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const said = await zach.chat.post(main.id, "Original.", "zach-1");
  const length = async (): Promise<number> => (await zach.chat.feed(0, 50)).length;

  // Each is done once, and then again as a retry would: the second call answers the same and writes nothing.
  const steps: [string, () => Promise<unknown>][] = [
    ["edit", () => zach.chat.edit(said.id, "Edited.")],
    ["react", () => shrimpy.chat.react(said.id, THUMBS_UP)],
    ["react with the bare form of an emoji that has a longer one", () => shrimpy.chat.react(said.id, "\u2764")],
    ["the same emoji in its longer form", () => shrimpy.chat.react(said.id, HEART)],
    ["unreact", () => shrimpy.chat.unreact(said.id, THUMBS_UP)],
    ["delete", () => zach.chat.delete(said.id)],
  ];
  for (const [what, step] of steps) {
    const first = await step();
    const logged = await length();
    const retry = await step();
    assert.deepEqual(retry, first, what);
    assert.equal(await length(), logged, `${what} added an event again`);
  }

  // A post retried after the message was edited and deleted is a retry still, and the message comes back as it stands.
  const retried = await zach.chat.post(main.id, "Original.", "zach-1");
  assert.equal(retried.id, said.id);
  assert.equal(retried.deleted, true);
  await assert.rejects(zach.chat.post(main.id, "Something else.", "zach-1"), { message: /already posted a different message/ });

  // Taking back what was never there, and a deleted message: nothing to change for the one, a refusal for the others.
  const gone = await zach.chat.read(main.id, null, 10);
  assert.deepEqual(await shrimpy.chat.unreact(said.id, PARTY), gone[0]);
  await assert.rejects(zach.chat.edit(said.id, "Back again."), { message: /was deleted/ });
  await assert.rejects(shrimpy.chat.react(said.id, PARTY), { message: /was deleted/ });
  // One of each, whatever was retried. The post and the edit carry no text, because the message was deleted.
  assert.deepEqual(logOf(await zach.chat.feed(0, 50)), [
    "posted",
    "edited",
    `reacted: ${THUMBS_UP}`,
    `reacted: ${HEART}`,
    `unreacted: ${THUMBS_UP}`,
    "deleted",
  ]);
});

test("the feed is a log of what happened to messages, in order, and reading a thread gives the messages as they now stand", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const watching = await zach.attach(main.id);
  const question = await zach.chat.post(main.id, "Is the build green?", "zach-1");
  const answer = await shrimpy.chat.post(main.id, "Yes.", "shrimpy-1");
  const before = (await zach.chat.threads(dm.id))[0];

  await zach.chat.edit(question.id, "Is the build green now?");
  await shrimpy.chat.react(question.id, THUMBS_UP);
  await zach.chat.react(answer.id, THUMBS_UP);
  await zach.chat.react(answer.id, PARTY);
  await zach.chat.unreact(answer.id, THUMBS_UP);

  const log = await zach.chat.feed(0, 50);
  assert.deepEqual(logOf(log), [
    "posted: Is the build green?",
    "posted: Yes.",
    "edited: Is the build green now?",
    `reacted: ${THUMBS_UP}`,
    `reacted: ${THUMBS_UP}`,
    `reacted: ${PARTY}`,
    `unreacted: ${THUMBS_UP}`,
  ]);
  assert.deepEqual(
    log.map((event) => event.message.id),
    [question.id, answer.id, question.id, question.id, answer.id, answer.id, answer.id],
    "each event names its message",
  );
  assert.deepEqual(
    log.map((event) => event.actor.id),
    [zach.me, shrimpy.me, zach.me, shrimpy.me, zach.me, zach.me, zach.me].map((member) => member.id),
  );
  assert.equal(new Set(log.map((event) => event.id)).size, log.length, "an event has an ID of its own");
  assert.deepEqual(
    log.map((event) => event.seq),
    [...log.map((event) => event.seq)].sort((a, b) => a - b),
  );
  assert.deepEqual([log[0]?.id, log[0]?.seq], [question.event, question.seq], "a message takes the position and the ID of its post");

  const [first, second] = await zach.chat.read(main.id, null, 10);
  assert.equal(first?.text, "Is the build green now?");
  assert.equal(typeof first.editedAt, "number");
  assert.deepEqual(first.reactions, [{ emoji: THUMBS_UP, memberIds: [shrimpy.me.id] }]);
  assert.deepEqual([second?.editedAt, second?.reactions], [null, [{ emoji: PARTY, memberIds: [zach.me.id] }]]);
  const live = await waitForView(watching, (view) => view.messages[1]?.reactions[0]?.emoji === PARTY);
  assert.deepEqual(live.messages, [first, second]);

  // Edits and reactions are not messages: the thread is not newer for them, and its preview follows the first message.
  const [after] = await zach.chat.threads(dm.id);
  assert.equal(after?.updatedAt, before?.updatedAt);
  assert.equal(after?.preview, "Is the build green now?");
});

test("a deleted message keeps its place and loses its text, its reactions and the text its events carried", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);
  const secret = await zach.chat.post(main.id, "The secret plan.", "zach-1");
  const other = await zach.chat.post(main.id, "Something else.", "zach-2");
  await zach.chat.edit(secret.id, "The secret plan, version 2.");
  await shrimpy.chat.react(secret.id, THUMBS_UP);

  await zach.chat.delete(secret.id);

  const [gone, kept] = await zach.chat.read(main.id, null, 10);
  assert.deepEqual([gone?.id, gone?.text, gone?.deleted, gone?.reactions], [secret.id, "", true, []]);
  assert.deepEqual([kept?.id, kept?.text, kept?.deleted], [other.id, "Something else.", false]);
  const log = await shrimpy.chat.feed(0, 50);
  assert.deepEqual(logOf(log), ["posted", "posted: Something else.", "edited", `reacted: ${THUMBS_UP}`, "deleted"]);
  assert.ok(log.every((event) => event.message.id !== secret.id || (event.message.deleted && event.message.preview === "")));
  assert.equal(JSON.stringify(log).includes("secret"), false, "nothing the feed offers still holds the text");
  assert.equal((await zach.chat.threads(dm.id))[0]?.preview, "Something else.", "the preview is of the first message that is still there");

  await zach.chat.delete(other.id);
  assert.equal((await zach.chat.threads(dm.id))[0]?.preview, null);
});
