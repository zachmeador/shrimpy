import assert from "node:assert/strict";
import { test } from "node:test";
import { agent, openTestDeps, person, refused } from "../testing/index.ts";
import { identify, listThreads, openDm, threadExists, watchableThread } from "./index.ts";

test("a thread can be watched by the members of its channel and nobody else", (t) => {
  const { deps } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const shrimpy = identify(deps, agent("Shrimpy"));
  const alice = identify(deps, person("Alice"));
  const [main] = listThreads(deps, zach, openDm(deps, zach, shrimpy).id);
  assert.ok(main);

  assert.equal(watchableThread(deps, zach, main.id), main.id);
  assert.equal(watchableThread(deps, shrimpy, main.id), main.id);
  assert.throws(() => watchableThread(deps, alice, main.id), refused(/^Unknown thread: th_/));
  assert.throws(() => watchableThread(deps, zach, "th_nothing"), refused(/^Unknown thread: th_nothing/));
  assert.throws(() => watchableThread(deps, zach, 5), refused(/^threadId must be an ID/));
});

test("a thread exists whoever asks", (t) => {
  const { deps } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const [main] = listThreads(deps, zach, openDm(deps, zach, agent("Shrimpy")).id);
  assert.ok(main);

  assert.equal(threadExists(deps, main.id), true);
  assert.equal(threadExists(deps, "th_nothing"), false);
});
