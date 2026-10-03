import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import {
  agent,
  countWatchers,
  follow,
  openTestDeps,
  person,
  settle,
} from "../testing/index.ts";
import { identify, listThreads, openDm, post, renameThread } from "../threads/index.ts";
import { nextMessage } from "./wait.ts";

function setup(t: Parameters<typeof openTestDeps>[0]) {
  const { deps } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const shrimpy = identify(deps, agent("Shrimpy"));
  const [main] = listThreads(deps, zach, openDm(deps, zach, shrimpy).id);
  assert.ok(main);
  return { deps, zach, main };
}

test("the wait ends with the next message, and a thread change does not end it", async (t) => {
  const { deps, zach, main } = setup(t);
  const counted = countWatchers(deps.store);
  const waiting = follow(nextMessage(counted.store, BACKGROUND_CONTEXT));
  assert.equal(counted.watching(), 1);

  renameThread(deps, zach, main.id, "Renamed");
  await settle();
  assert.equal(waiting.done, false);

  post(deps, zach, main.id, "now", "r1");
  await settle();
  assert.equal(waiting.done, true);
  assert.equal(waiting.error, undefined);
  assert.equal(counted.watching(), 0);
});

test("a cancelled wait rejects with the reason and stops watching", async (t) => {
  const { deps } = setup(t);
  const counted = countWatchers(deps.store);
  const controller = new AbortController();
  const waiting = follow(nextMessage(counted.store, withAbortSignal(controller.signal, BACKGROUND_CONTEXT)));
  assert.equal(counted.watching(), 1);

  const reason = new Error("Client disconnected");
  controller.abort(reason);
  await settle();

  assert.equal(waiting.error, reason);
  assert.equal(counted.watching(), 0);
});

test("a wait cancelled without a reason rejects as an abort", async (t) => {
  const { deps } = setup(t);
  const controller = new AbortController();
  const waiting = follow(nextMessage(deps.store, withAbortSignal(controller.signal, BACKGROUND_CONTEXT)));

  controller.abort();
  await settle();

  assert.equal((waiting.error as Error).name, "AbortError");
});

test("a wait that was cancelled before it began never watches", async (t) => {
  const { deps } = setup(t);
  const counted = countWatchers(deps.store);
  const controller = new AbortController();
  controller.abort(new Error("already gone"));

  const waiting = follow(nextMessage(counted.store, withAbortSignal(controller.signal, BACKGROUND_CONTEXT)));
  await settle();

  assert.equal((waiting.error as Error).message, "already gone");
  assert.equal(counted.watching(), 0);
});

test("a wait that has ended ignores a later cancel", async (t) => {
  const { deps, zach, main } = setup(t);
  const controller = new AbortController();
  const waiting = follow(nextMessage(deps.store, withAbortSignal(controller.signal, BACKGROUND_CONTEXT)));

  post(deps, zach, main.id, "first", "r1");
  controller.abort(new Error("too late"));
  await settle();

  assert.equal(waiting.error, undefined);
  assert.equal(waiting.done, true);
});
