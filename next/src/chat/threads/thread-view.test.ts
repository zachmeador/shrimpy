import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_LENGTH } from "../../contracts/chat/index.ts";
import { ANSWER_BYTES } from "../input/index.ts";
import { agent, openTestDeps, person } from "../testing/index.ts";
import { identify, listThreads, openDm, post, setWorking } from "./index.ts";
import { readThreadView, VIEW_MESSAGES } from "./thread-view.ts";

function setup(t: Parameters<typeof openTestDeps>[0]) {
  const { deps, clock } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const shrimpy = identify(deps, agent("Shrimpy"));
  const dm = openDm(deps, zach, shrimpy);
  const [main] = listThreads(deps, zach, dm.id);
  if (main === undefined) throw new Error("the DM has no main thread");
  return { deps, clock, zach, shrimpy, main };
}

test("an empty thread's view is the thread alone", (t) => {
  const { deps, main } = setup(t);

  assert.deepEqual(readThreadView(deps, main.id), { thread: main, messages: [], earlier: 0 });
});

test("a view holds the thread, its newest messages oldest first, and how many come before", (t) => {
  const { deps, clock, zach, shrimpy, main } = setup(t);
  for (let number = 1; number <= VIEW_MESSAGES + 5; number++) {
    clock.advance();
    post(deps, number % 2 === 0 ? shrimpy : zach, main.id, `message ${number}`, `request-${number}`);
  }

  const view = readThreadView(deps, main.id);

  assert.equal(VIEW_MESSAGES, 200);
  assert.equal(view.messages.length, 200);
  assert.equal(view.earlier, 5);
  assert.equal(view.messages[0]?.text, "message 6");
  assert.equal(view.messages.at(-1)?.text, "message 205");
  assert.equal(view.thread.preview, "message 1");
  assert.equal(view.thread.updatedAt, clock.now());
});

test("a view of very long messages holds the newest that fit one answer, and counts the rest", (t) => {
  const { deps, clock, zach, main } = setup(t);
  const posted = 30;
  for (let number = 1; number <= posted; number++) {
    clock.advance();
    post(deps, zach, main.id, `${number} ${"é".repeat(MAX_MESSAGE_LENGTH - 10)}`, `request-${number}`);
  }

  const view = readThreadView(deps, main.id);

  assert.ok(view.messages.length > 1 && view.messages.length < posted, String(view.messages.length));
  assert.equal(view.earlier, posted - view.messages.length);
  assert.ok(view.messages.at(-1)?.text.startsWith(`${posted} `));
  assert.ok(Buffer.byteLength(JSON.stringify(view.messages)) <= ANSWER_BYTES);
});

test("a view says who is working in the thread", (t) => {
  const { deps, clock, shrimpy, main } = setup(t);
  clock.advance();
  setWorking(deps, {}, shrimpy, main.id, true);

  assert.deepEqual(readThreadView(deps, main.id).thread.working, [
    { memberId: shrimpy.id, since: clock.now() },
  ]);
});

test("a thread that is not there has no view", (t) => {
  const { deps } = setup(t);

  assert.throws(() => readThreadView(deps, "th_nothing"), /Unknown thread th_nothing/);
});
