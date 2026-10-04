import assert from "node:assert/strict";
import { test } from "node:test";
import { eventually, settle, until, waitForView, within } from "./index.ts";

test("settle lets what is ready to run, run", async () => {
  let ran = false;
  setImmediate(() => {
    ran = true;
  });

  await settle();

  assert.equal(ran, true);
});

test("eventually returns the first value that is accepted", async () => {
  let reads = 0;

  const value = await eventually(
    () => (reads += 1),
    (read) => read === 3,
  );

  assert.equal(value, 3);
});

test("eventually reads asynchronously, and gives up naming what it waited for", async () => {
  await assert.rejects(
    eventually(
      () => Promise.resolve(["still", "starting"]),
      (words) => words.length === 3,
      { what: "three words", timeoutMs: 50 },
    ),
    /^Error: Gave up waiting for three words after 50 ms; the last value was \["still","starting"\]$/,
  );
});

test("until waits for a condition, and says what it was waiting for when it fails", async () => {
  let ready = false;
  setTimeout(() => {
    ready = true;
  }, 30);

  await until(() => ready);

  await assert.rejects(
    until(() => false, "the model to start answering", 30),
    /Gave up waiting for the model to start answering after 30 ms; the last value was false/,
  );
});

test("within passes on what the work resolves with, and fails naming the work when it is late", async () => {
  assert.equal(await within(1000, Promise.resolve("done"), "the work"), "done");

  await assert.rejects(
    within(30, new Promise<void>(() => undefined), "stopping"),
    /^Error: stopping did not finish within 30 ms$/,
  );
  await assert.rejects(within(1000, Promise.reject(new Error("it failed")), "the work"), /it failed/);
});

function watchable<V>(initial: V) {
  const listeners = new Set<(view: V) => void>();
  return {
    listeners,
    handle: {
      subscribe(listener: (view: V) => void) {
        listeners.add(listener);
        listener(initial);
        return () => void listeners.delete(listener);
      },
    },
    publish: (view: V) => [...listeners].forEach((listener) => listener(view)),
  };
}

test("waitForView resolves with the first view that satisfies the condition", async () => {
  const source = watchable(1);
  const waiting = waitForView(source.handle, (view) => view >= 3);

  source.publish(2);
  source.publish(3);
  source.publish(4);

  assert.equal(await waiting, 3);
  assert.equal(source.listeners.size, 0);
});

test("waitForView accepts a view that arrives while it is still subscribing", async () => {
  const source = watchable(7);

  assert.equal(await waitForView(source.handle, () => true), 7);
  assert.equal(source.listeners.size, 0);
});
