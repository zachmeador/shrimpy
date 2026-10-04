import assert from "node:assert/strict";
import { test } from "node:test";
import { until } from "../../../lib/testing/index.ts";
import { interrupt } from "./interrupt.ts";

function start(windowMs = 60_000) {
  const told: boolean[] = [];
  const quitting = interrupt({ windowMs, waiting: (armed) => told.push(armed) });
  return { quitting, told };
}

test("a first press with something typed clears it and waits for a second, which quits", () => {
  const { quitting, told } = start();

  assert.equal(quitting.press(true), "cleared");
  assert.equal(quitting.press(false), "quit");

  assert.deepEqual(told, [true, false]);
  quitting.close();
});

test("a first press with nothing typed only waits", () => {
  const { quitting, told } = start();

  assert.equal(quitting.press(false), "armed");
  assert.deepEqual(told, [true]);
  assert.equal(quitting.press(false), "quit");
  quitting.close();
});

test("any other key starts again", () => {
  const { quitting, told } = start();
  quitting.press(false);

  quitting.other();

  assert.deepEqual(told, [true, false]);
  assert.equal(quitting.press(false), "armed");
  quitting.close();
});

test("something typed between two presses is cleared by the second, which waits again", () => {
  const { quitting } = start();
  quitting.press(false);

  assert.equal(quitting.press(true), "cleared");
  assert.equal(quitting.press(false), "quit");
  quitting.close();
});

test("a second press that comes too late is a first", async () => {
  const { quitting, told } = start(20);
  quitting.press(false);

  await until(() => told.length === 2, "the wait to end");

  assert.deepEqual(told, [true, false]);
  assert.equal(quitting.press(false), "armed");
  quitting.close();
});

test("closing ends the wait without telling anyone", () => {
  const { quitting, told } = start(20);
  quitting.press(false);

  quitting.close();

  assert.deepEqual(told, [true]);
});
