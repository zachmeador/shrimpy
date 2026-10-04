import assert from "node:assert/strict";
import { test } from "node:test";
import { createListeners } from "./index.ts";

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
