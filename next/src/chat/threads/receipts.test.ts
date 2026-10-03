import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_RECEIPT_DETAIL_LENGTH } from "../../contracts/chat/index.ts";
import { agent, openTestDm, outcome, refused } from "../testing/index.ts";
import { createThread, identify, leaveReceipt, listThreads, openDm, post, readMessages } from "./index.ts";

test("an agent leaves a receipt on a message, and both sides read it there", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const asked = post(deps, zach, main.id, "are you there", "r1");
  assert.deepEqual(asked.receipts, []);

  leaveReceipt(deps, shrimpy, [asked.id], outcome("silent"));

  const expected = [{ memberId: shrimpy.id, status: "silent", reply: null, detail: null }];
  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.receipts, expected);
  assert.deepEqual(readMessages(deps, shrimpy, main.id, null, 10)[0]?.receipts, expected);
});

test("an answered receipt names its reply, and a failed one its reason or none", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const question = post(deps, zach, main.id, "what is 2 + 2", "r1");
  const answer = post(deps, shrimpy, main.id, "4", "r2");
  const trouble = post(deps, zach, main.id, "and 3 + 3", "r3");
  const unexplained = post(deps, zach, main.id, "and 4 + 4", "r4");

  leaveReceipt(deps, shrimpy, [question.id], outcome("answered", { reply: answer.id }));
  leaveReceipt(deps, shrimpy, [trouble.id], outcome("failed", { detail: "The model timed out." }));
  leaveReceipt(deps, shrimpy, [unexplained.id], outcome("failed"));

  const [first, , second, third] = readMessages(deps, zach, main.id, null, 10);
  assert.deepEqual(first?.receipts, [{ memberId: shrimpy.id, status: "answered", reply: answer.id, detail: null }]);
  assert.deepEqual(second?.receipts, [
    { memberId: shrimpy.id, status: "failed", reply: null, detail: "The model timed out." },
  ]);
  assert.deepEqual(third?.receipts, [{ memberId: shrimpy.id, status: "failed", reply: null, detail: null }]);
});

test("every status can be left", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const reply = post(deps, shrimpy, main.id, "an answer", "r1");
  const given = [
    outcome("answered", { reply: reply.id }),
    outcome("silent"),
    outcome("stopped"),
    outcome("skipped"),
    outcome("failed", { detail: "No reason to give." }),
  ];
  const asked = given.map((_, index) => post(deps, zach, main.id, `message ${index}`, `q${index}`));

  asked.forEach((message, index) => leaveReceipt(deps, shrimpy, [message.id], given[index]!));

  const read = readMessages(deps, zach, main.id, null, 20).filter((message) => message.author.id === zach.id);
  assert.deepEqual(
    read.map((message) => message.receipts),
    given.map((left) => [{ memberId: shrimpy.id, ...left }]),
  );
});

test("one call leaves the receipt on several messages, and one reply can answer them all", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const first = post(deps, zach, main.id, "one", "r1");
  const second = post(deps, zach, main.id, "two", "r2");
  const answer = post(deps, shrimpy, main.id, "one and two", "r3");

  leaveReceipt(deps, shrimpy, [first.id, second.id], outcome("answered", { reply: answer.id }));

  const expected = [{ memberId: shrimpy.id, status: "answered", reply: answer.id, detail: null }];
  const read = readMessages(deps, zach, main.id, null, 10);
  assert.deepEqual(read[0]?.receipts, expected);
  assert.deepEqual(read[1]?.receipts, expected);
  assert.deepEqual(read[2]?.receipts, []);
});

test("a later receipt replaces the agent's earlier one, and a skipped message can be answered later", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const asked = post(deps, zach, main.id, "are you there", "r1");
  const answer = post(deps, shrimpy, main.id, "Yes.", "r2");
  const latest = (): unknown => readMessages(deps, zach, main.id, null, 10)[0]?.receipts;
  const mine = (left: object): unknown => [{ memberId: shrimpy.id, ...left }];

  leaveReceipt(deps, shrimpy, [asked.id], outcome("skipped"));
  assert.deepEqual(latest(), mine({ status: "skipped", reply: null, detail: null }));

  leaveReceipt(deps, shrimpy, [asked.id], outcome("answered", { reply: answer.id }));
  assert.deepEqual(latest(), mine({ status: "answered", reply: answer.id, detail: null }));

  leaveReceipt(deps, shrimpy, [asked.id], outcome("failed", { detail: "Lost the connection." }));
  assert.deepEqual(latest(), mine({ status: "failed", reply: null, detail: "Lost the connection." }));

  leaveReceipt(deps, shrimpy, [asked.id], outcome("silent"));
  assert.deepEqual(latest(), mine({ status: "silent", reply: null, detail: null }));
});

test("each agent has its own receipt on a message, listed in order of member ID", (t) => {
  const { deps } = openTestDm(t);
  const alpha = identify(deps, agent("Alpha"));
  const beta = identify(deps, agent("Beta"));
  const dm = openDm(deps, alpha, beta);
  const [main] = listThreads(deps, alpha, dm.id);
  assert.ok(main);
  const said = post(deps, alpha, main.id, "hello", "r1");

  // Beta leaves its receipt first, and Alpha, who wrote the message, leaves one on it too.
  leaveReceipt(deps, beta, [said.id], outcome("silent"));
  leaveReceipt(deps, alpha, [said.id], outcome("stopped"));

  const receipts = readMessages(deps, beta, main.id, null, 10)[0]?.receipts;
  assert.deepEqual(
    receipts?.map((receipt) => [receipt.memberId, receipt.status]),
    [
      [alpha.id, "stopped"],
      [beta.id, "silent"],
    ],
  );
});

test("a receipt is not a message: the thread's time, its previews and the newest position stay", (t) => {
  const { deps, clock, zach, shrimpy, dm, main } = openTestDm(t);
  const asked = post(deps, zach, main.id, "are you there", "r1");
  clock.advance(60_000);
  const before = { threads: listThreads(deps, zach, dm.id), head: deps.store.transaction((tx) => tx.head()) };

  leaveReceipt(deps, shrimpy, [asked.id], outcome("silent"));
  leaveReceipt(deps, shrimpy, [asked.id], outcome("stopped"));

  assert.deepEqual(listThreads(deps, zach, dm.id), before.threads);
  assert.equal(deps.store.transaction((tx) => tx.head()), before.head);
  assert.equal(deps.store.transaction((tx) => tx.messageCount(main.id)), 1);
  assert.equal(readMessages(deps, zach, main.id, null, 10).length, 1);
});

test("only an agent leaves a receipt, and only on messages in a channel it belongs to", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const outsider = identify(deps, agent("Outsider"));
  const asked = post(deps, zach, main.id, "are you there", "r1");

  assert.throws(() => leaveReceipt(deps, zach, [asked.id], outcome("silent")), refused(/^Only an agent/));
  assert.throws(
    () => leaveReceipt(deps, outsider, [asked.id], outcome("silent")),
    refused(/^Unknown message: msg_/),
  );
  assert.throws(
    () => leaveReceipt(deps, shrimpy, ["msg_nothing"], outcome("silent")),
    refused(/^Unknown message: msg_nothing/),
  );
  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.receipts, []);
});

test("the call is all or nothing", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const outsider = identify(deps, agent("Outsider"));
  const mine = post(deps, zach, main.id, "for Shrimpy", "r1");
  const other = openDm(deps, zach, outsider);
  const [elsewhere] = listThreads(deps, zach, other.id);
  assert.ok(elsewhere);
  const theirs = post(deps, zach, elsewhere.id, "for the outsider", "r2");

  assert.throws(
    () => leaveReceipt(deps, shrimpy, [mine.id, theirs.id], outcome("silent")),
    refused(/^Unknown message: msg_/),
  );
  assert.throws(() => leaveReceipt(deps, shrimpy, [mine.id, "msg_nothing"], outcome("silent")), refused(/^Unknown/));
  assert.throws(() => leaveReceipt(deps, shrimpy, [], outcome("silent")), refused(/^messageIds must be a list/));
  const tooMany = Array.from({ length: 201 }, () => mine.id);
  assert.throws(
    () => leaveReceipt(deps, shrimpy, tooMany, outcome("silent")),
    refused(/^messageIds must be a list of 1 to 200 IDs/),
  );

  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.receipts, []);
  assert.deepEqual(readMessages(deps, zach, elsewhere.id, null, 10)[0]?.receipts, []);
});

test("a reply is a message the caller wrote in the same thread as the message it answers", (t) => {
  const { deps, zach, shrimpy, dm, main } = openTestDm(t);
  const side = createThread(deps, zach, dm.id, null);
  const asked = post(deps, zach, main.id, "what is 2 + 2", "r1");
  const notMine = post(deps, zach, main.id, "I wrote this one", "r2");
  const elsewhere = post(deps, shrimpy, side.id, "an answer in another thread", "r3");

  for (const reply of [notMine.id, elsewhere.id, "msg_nothing"]) {
    assert.throws(
      () => leaveReceipt(deps, shrimpy, [asked.id], outcome("answered", { reply })),
      refused(new RegExp(`^${reply} is not a message you wrote in the same thread as ${asked.id}`)),
    );
  }
  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.receipts, []);

  const answer = post(deps, shrimpy, main.id, "4", "r4");
  leaveReceipt(deps, shrimpy, [asked.id], outcome("answered", { reply: answer.id }));
  assert.equal(readMessages(deps, zach, main.id, null, 10)[0]?.receipts[0]?.reply, answer.id);
});

test("one reply answers messages only if they all sit in its thread, and the other statuses may span threads", (t) => {
  const { deps, zach, shrimpy, dm, main } = openTestDm(t);
  const side = createThread(deps, zach, dm.id, null);
  const inMain = post(deps, zach, main.id, "in the main thread", "r1");
  const inSide = post(deps, zach, side.id, "in a side thread", "r2");
  const answer = post(deps, shrimpy, main.id, "an answer", "r3");

  assert.throws(
    () => leaveReceipt(deps, shrimpy, [inMain.id, inSide.id], outcome("answered", { reply: answer.id })),
    refused(/is not a message you wrote in the same thread as /),
  );
  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.receipts, []);

  leaveReceipt(deps, shrimpy, [inMain.id, inSide.id], outcome("skipped"));

  assert.equal(readMessages(deps, zach, main.id, null, 10)[0]?.receipts[0]?.status, "skipped");
  assert.equal(readMessages(deps, zach, side.id, null, 10)[0]?.receipts[0]?.status, "skipped");
});

test("what a receipt is made of is checked", (t) => {
  const { deps, zach, shrimpy, main } = openTestDm(t);
  const asked = post(deps, zach, main.id, "are you there", "r1");
  const longest = "d".repeat(MAX_RECEIPT_DETAIL_LENGTH);
  const wrong: [unknown, RegExp][] = [
    [{ status: "tidy", reply: null, detail: null }, /^receipt.status must be/],
    [{ status: "answered", reply: null, detail: null }, /^An answered receipt needs a reply/],
    [{ status: "silent", reply: "msg_1", detail: null }, /^Only an answered receipt has a reply/],
    [{ status: "silent", reply: null, detail: "why" }, /^Only a failed receipt has a detail/],
    [{ status: "failed", reply: null, detail: "" }, /^receipt.detail must be some text/],
    [{ status: "failed", reply: null, detail: `${longest}!` }, /^receipt.detail holds at most 500 characters/],
    ["silent", /^receipt must be a receipt/],
  ];

  for (const [receipt, reason] of wrong) {
    assert.throws(() => leaveReceipt(deps, shrimpy, [asked.id], receipt), refused(reason), JSON.stringify(receipt));
  }
  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.receipts, []);

  leaveReceipt(deps, shrimpy, [asked.id], outcome("failed", { detail: longest }));
  assert.equal(readMessages(deps, zach, main.id, null, 10)[0]?.receipts[0]?.detail, longest);
});
