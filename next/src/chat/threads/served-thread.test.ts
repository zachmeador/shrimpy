import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { stopAfter } from "../../lib/testing/index.ts";
import { openTestDm } from "../testing/index.ts";
import {
  archiveThread,
  createThread,
  identify,
  markSkipped,
  post,
  renameThread,
  serveThread,
  setWorking,
} from "./index.ts";
import { readThreadView } from "./thread-view.ts";

function setup(t: TestContext) {
  const { deps, clock, zach, shrimpy, dm, main } = openTestDm(t);
  const served = serveThread(deps, main.id);
  stopAfter(t, () => served.close());
  return { deps, clock, zach, shrimpy, dm, main, served };
}

/** How many updates a watcher of the state has been sent since it subscribed. */
function countUpdates(served: ReturnType<typeof serveThread>): () => number {
  let updates = 0;
  served.state.subscribe((_view, _context, delivery) => {
    if (delivery.kind === "update") updates += 1;
  });
  return () => updates;
}

test("a served thread starts as the thread's view", (t) => {
  const { deps, main, served } = setup(t);

  assert.deepEqual(served.state.value, readThreadView(deps, main.id));
});

test("while someone watches, the view follows messages, names, archiving, skips and work", (t) => {
  const { deps, clock, zach, shrimpy, main, served } = setup(t);
  served.watch();
  const here = {};
  const steps: (() => void)[] = [
    () => post(deps, zach, main.id, "hello", "r1"),
    () => post(deps, shrimpy, main.id, "hi", "r2"),
    () => renameThread(deps, zach, main.id, "Main"),
    () => archiveThread(deps, zach, main.id, true),
    () => markSkipped(deps, shrimpy, [readThreadView(deps, main.id).messages[0]?.id ?? ""]),
    () => setWorking(deps, here, shrimpy, main.id, true),
    () => setWorking(deps, here, shrimpy, main.id, false),
    () => setWorking(deps, here, shrimpy, main.id, true),
    () => deps.working.end(here),
  ];

  for (const step of steps) {
    clock.advance();
    step();
    assert.deepEqual(served.state.value, readThreadView(deps, main.id));
  }
  assert.deepEqual(served.state.value.messages[0]?.skippedBy, [shrimpy.id]);
  assert.deepEqual(served.state.value.thread.working, []);
});

test("the view follows a member's new name", (t) => {
  const { deps, zach, shrimpy, main, served } = setup(t);
  served.watch();
  post(deps, zach, main.id, "hello", "r1");
  post(deps, shrimpy, main.id, "hi", "r2");

  identify(deps, { ...zach, name: "Zachariah" });

  assert.deepEqual(served.state.value, readThreadView(deps, main.id));
  assert.deepEqual(
    served.state.value.messages.map((message) => message.author.name),
    ["Zachariah", "Shrimpy"],
  );
});

test("a long thread's view keeps its newest 200 messages and counts the rest", (t) => {
  const { deps, zach, main, served } = setup(t);
  served.watch();

  for (let number = 1; number <= 230; number++) {
    post(deps, zach, main.id, `message ${number}`, `request-${number}`);
  }

  const view = served.state.value;
  assert.deepEqual(view, readThreadView(deps, main.id));
  assert.equal(view.messages.length, 200);
  assert.equal(view.earlier, 30);
  assert.equal(view.messages[0]?.text, "message 31");
});

test("the view follows the thread through any mix of changes", (t) => {
  const { deps, clock, zach, shrimpy, dm, main, served } = setup(t);
  const side = createThread(deps, zach, dm.id, "Side");
  served.watch();
  const connections = [{}, {}];
  // A small deterministic generator, so a failure can be reproduced.
  let seed = 20_241_003;
  const next = (limit: number): number => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    return seed % limit;
  };

  for (let step = 0; step < 400; step++) {
    clock.advance(next(3) * 1000);
    const author = next(2) === 0 ? zach : shrimpy;
    const connection = connections[next(2)] ?? {};
    const choice = next(22);
    const request = `request-${step}`;
    if (choice < 11) post(deps, author, main.id, `message ${step}`, request);
    else if (choice < 13) post(deps, author, side.id, `side ${step}`, request);
    else if (choice === 13) renameThread(deps, author, main.id, `Name ${step}`);
    else if (choice === 14) archiveThread(deps, author, main.id, next(2) === 0);
    else if (choice === 15) {
      const messages = readThreadView(deps, main.id).messages;
      const picked = messages[next(Math.max(messages.length, 1))];
      if (picked !== undefined) markSkipped(deps, shrimpy, [picked.id]);
    } else if (choice < 19) setWorking(deps, connection, author, main.id, next(2) === 0);
    else if (choice === 19) deps.working.end(connection);
    else identify(deps, { ...author, name: `${author.name} ${step}` });

    assert.deepEqual(served.state.value, readThreadView(deps, main.id), `after step ${step}`);
  }
});

test("a thread nobody watches follows nothing, and catches up when someone does", (t) => {
  const { deps, zach, main, served } = setup(t);

  post(deps, zach, main.id, "while nobody was looking", "r1");
  assert.deepEqual(served.state.value.messages, []);

  const stop = served.watch();
  assert.equal(served.state.value.messages.length, 1);
  stop();
  post(deps, zach, main.id, "and again", "r2");
  assert.equal(served.state.value.messages.length, 1);
});

test("it follows its own thread only", (t) => {
  const { deps, zach, dm, main, served } = setup(t);
  const side = createThread(deps, zach, dm.id, "Elsewhere");
  served.watch();
  const updates = countUpdates(served);

  post(deps, zach, side.id, "somewhere else", "r1");
  renameThread(deps, zach, side.id, "Renamed");
  setWorking(deps, {}, zach, side.id, true);
  assert.equal(updates(), 0);

  post(deps, zach, main.id, "here", "r2");
  assert.equal(updates(), 1);
});

test("it keeps following until the last watcher is done, and a watcher is done only once", (t) => {
  const { deps, zach, main, served } = setup(t);
  const first = served.watch();
  const second = served.watch();

  first();
  first();
  post(deps, zach, main.id, "one watcher left", "r1");
  assert.equal(served.state.value.messages.length, 1);

  second();
  post(deps, zach, main.id, "nobody left", "r2");
  assert.equal(served.state.value.messages.length, 1);
});

test("a thread that is closed follows nothing and takes no new watcher", (t) => {
  const { deps, zach, main, served } = setup(t);
  served.watch();

  served.close();
  post(deps, zach, main.id, "after close", "r1");

  assert.deepEqual(served.state.value.messages, []);
  assert.throws(() => served.watch(), /no longer served/);
});
