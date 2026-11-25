import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent, Member, Message } from "../../contracts/chat/index.ts";
import { agent, openTestDeps, outcome, person } from "../testing/index.ts";
import { answer } from "./answer.ts";
import {
  channelView,
  type ChatDeps,
  createRoom,
  createThread,
  deleteMessage,
  editMessage,
  leaveReceipt,
  openDm,
  post,
  react,
  threadView,
  unreact,
} from "./index.ts";

const THUMBS_UP = "\u{1F44D}";

/** The log a member is offered, as lines: an event's kind and what it carries, as "edited: new text" or "deleted". */
function logOf(deps: ChatDeps, member: Member): string[] {
  return logged(deps, member).map((event) => {
    const carried = "text" in event ? event.text : "emoji" in event ? event.emoji : "status" in event ? event.status : "";
    return carried === "" ? event.kind : `${event.kind}: ${carried}`;
  });
}

const logged = (deps: ChatDeps, member: Member): ChatEvent[] =>
  deps.store.transaction((tx) => tx.eventsAfter(member.id, 0, 100));

/** A thread of the DM between you and an agent. */
function startDm(t: Parameters<typeof openTestDeps>[0]) {
  const { deps, clock, know } = openTestDeps(t);
  const zach = know(person("Zach"));
  const shrimpy = know(agent("Shrimpy"));
  const dm = openDm(deps, zach, shrimpy.id);
  const main = createThread(deps, zach, dm.id, null);
  return { deps, clock, know, zach, shrimpy, dm, main };
}

test("the log is what happened to messages, in order, and a delete takes the text out of it too", (t) => {
  const { deps, zach, shrimpy, main } = startDm(t);
  const said = post(deps, zach, main.id, "The secret plan.", "zach-1");
  const other = post(deps, zach, main.id, "Something else.", "zach-2");

  // Each is done once, and again as a retry would be: the second answers the same and writes nothing.
  const steps: [string, () => Message][] = [
    ["edit", () => editMessage(deps, zach, said.id, "The secret plan, version 2.", "zach-3")],
    ["react", () => react(deps, shrimpy, said.id, THUMBS_UP, "shrimpy-1")],
    ["unreact", () => unreact(deps, shrimpy, said.id, THUMBS_UP, "shrimpy-2")],
    ["delete", () => deleteMessage(deps, zach, said.id, "zach-4")],
  ];
  for (const [what, step] of steps) {
    const first = step();
    const length = logged(deps, zach).length;
    assert.deepEqual(step(), first, what);
    assert.equal(logged(deps, zach).length, length, `${what} wrote again`);
  }
  assert.equal(post(deps, zach, main.id, "The secret plan.", "zach-1").id, said.id, "a post retried after a delete is a retry still");

  const view = threadView(deps, zach, main.id);
  assert.deepEqual(
    view.messages.map((message) => [message.id, message.text, message.deleted, message.reactions]),
    [
      [said.id, "", true, []],
      [other.id, "Something else.", false, []],
    ],
  );
  assert.deepEqual(logOf(deps, shrimpy), ["posted", "posted: Something else.", "edited", `reacted: ${THUMBS_UP}`, `unreacted: ${THUMBS_UP}`, "deleted"]);
  assert.equal(JSON.stringify(logged(deps, shrimpy)).includes("secret"), false, "nothing offered still holds the text");
  assert.equal(view.thread?.preview, "Something else.", "the preview is of the first message that is still there");
  assert.equal(answer(() => editMessage(deps, zach, said.id, "Back again.", "zach-5")).kind, "refused");
});

test("a receipt is an event that replaces the one before, left on several events all or none", (t) => {
  const { deps, zach, shrimpy, main } = startDm(t);
  const first = post(deps, zach, main.id, "one", "zach-1");
  const second = post(deps, zach, main.id, "two", "zach-2");
  const reply = post(deps, shrimpy, main.id, "one and two", "shrimpy-1");

  const refused = (events: string[], given: ReturnType<typeof outcome>, who: Member = shrimpy): void =>
    assert.equal(answer(() => leaveReceipt(deps, who, events, given)).kind, "refused", JSON.stringify([events, given]));
  refused([first.event], outcome("answered"));
  refused([first.event], outcome("answered", { reply: first.id }));
  refused([first.event, "evt_nothing"], outcome("silent"));
  refused([first.event], outcome("silent"), zach);
  assert.deepEqual(logOf(deps, zach), ["posted: one", "posted: two", "posted: one and two"], "a refused receipt writes nothing");

  leaveReceipt(deps, shrimpy, [first.event, second.event], outcome("skipped"));
  leaveReceipt(deps, shrimpy, [first.event, second.event], outcome("answered", { reply: reply.id }));
  const length = logged(deps, zach).length;
  leaveReceipt(deps, shrimpy, [first.event, second.event], outcome("answered", { reply: reply.id }));
  assert.equal(logged(deps, zach).length, length, "leaving the receipt an event has writes nothing");

  assert.deepEqual(logOf(deps, zach).slice(3), ["receipted: skipped", "receipted: skipped", "receipted: answered", "receipted: answered"]);
  const left = (event: string) => [{ memberId: shrimpy.id, event, status: "answered", reply: reply.id, detail: null }];
  assert.deepEqual(
    threadView(deps, zach, main.id).messages.map((message) => message.receipts),
    [left(first.event), left(second.event), []],
    "the message shows the receipt that stands",
  );
  const receipt = logged(deps, zach).find((event) => event.kind === "receipted");
  assert.ok(receipt);
  refused([first.event, receipt.id], outcome("stopped"));
  assert.equal(logged(deps, zach).length, length);
});

test("a message mentions the members its text names, or everyone but its author with @all, in a DM as in a room", (t) => {
  const { deps, know, zach, shrimpy, main } = startDm(t);
  const scout = know(agent("scout"));
  const maya = know(agent("maya"));
  know(agent("rex"));
  const room = createRoom(deps, zach, "Ops", [scout.id, maya.id]);
  const inRoom = channelView(deps, zach, room.id).threads[0];
  assert.ok(inRoom);
  const names = new Map([zach, shrimpy, scout, maya].map((member) => [member.id, member.name]));
  let number = 0;
  const say = (threadId: string, text: string): (string | undefined)[] =>
    post(deps, zach, threadId, text, `zach-${String(++number)}`).mentions.map((id) => names.get(id));

  assert.deepEqual(say(inRoom.id, "@scout, can you look?"), ["scout"]);
  assert.deepEqual(say(inRoom.id, "@MAYA and @Scout: both of you.").toSorted(), ["maya", "scout"], "whatever the case");
  assert.deepEqual(say(inRoom.id, `@all, and @${zach.name} too`).toSorted(), ["maya", "scout"], "@all is everyone there but the author");
  assert.deepEqual(say(inRoom.id, "@rex, are you there? Write to me@scout or ask @scoutmaster."), [], "only a member's name on its own");
  assert.deepEqual(say(main.id, "hello"), [], "a DM message that names nobody mentions nobody");
  assert.deepEqual(say(main.id, "@Shrimpy stop that"), ["Shrimpy"]);
  assert.deepEqual(say(main.id, "@all hello"), ["Shrimpy"]);

  const message = post(deps, zach, inRoom.id, "@scout first", "zach-edit");
  assert.deepEqual(editMessage(deps, zach, message.id, "@maya instead", "zach-edit-2").mentions, [maya.id], "an edit works it out again");
});
