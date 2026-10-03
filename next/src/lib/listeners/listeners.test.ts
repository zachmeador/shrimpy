import assert from "node:assert/strict";
import { test } from "node:test";
import { createListeners } from "./index.ts";

test("every listener hears each value, until it stops listening", () => {
  const listeners = createListeners<number>(() => undefined);
  const heard: string[] = [];
  const stopFirst = listeners.add((value) => heard.push(`first ${value}`));
  listeners.add((value) => heard.push(`second ${value}`));

  listeners.notify(1);
  stopFirst();
  stopFirst();
  listeners.notify(2);

  assert.deepEqual(heard, ["first 1", "second 1", "second 2"]);
});

test("a listener that throws is reported, and the others still hear the value", () => {
  const reported: Error[] = [];
  const listeners = createListeners<string>((error) => reported.push(error));
  const heard: string[] = [];
  listeners.add(() => {
    throw new Error("could not listen");
  });
  const notAnError: unknown = "not even an error";
  listeners.add(() => {
    throw notAnError;
  });
  listeners.add((value) => heard.push(value));

  assert.doesNotThrow(() => listeners.notify("news"));

  assert.deepEqual(heard, ["news"]);
  assert.deepEqual(
    reported.map((error) => error.message),
    ["could not listen", "not even an error"],
  );
});

test("a listener added while the others are being told hears the next value, not this one", () => {
  const listeners = createListeners<number>(() => undefined);
  const late: number[] = [];
  listeners.add(() => {
    listeners.add((value) => late.push(value));
  });

  listeners.notify(1);
  assert.deepEqual(late, []);
  listeners.notify(2);

  assert.deepEqual(late, [2]);
});

test("a listener that stops while the others are being told still hears this value", () => {
  const listeners = createListeners<number>(() => undefined);
  const heard: number[] = [];
  let stopSecond = (): void => undefined;
  listeners.add(() => stopSecond());
  stopSecond = listeners.add((value) => heard.push(value));

  listeners.notify(1);
  listeners.notify(2);

  assert.deepEqual(heard, [1]);
});

test("clearing forgets every listener", () => {
  const listeners = createListeners<number>(() => undefined);
  const heard: number[] = [];
  listeners.add((value) => heard.push(value));

  listeners.clear();
  listeners.notify(1);

  assert.deepEqual(heard, []);
});
