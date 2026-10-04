import assert from "node:assert/strict";
import { test } from "node:test";
import { processIo } from "./index.ts";

test("a command prints a line to standard output or standard error", (t) => {
  const out = t.mock.method(process.stdout, "write", () => true);
  const err = t.mock.method(process.stderr, "write", () => true);

  processIo().out("to stdout");
  processIo().err("to stderr");

  assert.deepEqual(
    out.mock.calls.map((call) => call.arguments[0]),
    ["to stdout\n"],
  );
  assert.deepEqual(
    err.mock.calls.map((call) => call.arguments[0]),
    ["to stderr\n"],
  );
});

test("a person is at a terminal when both input and output are one", () => {
  const before = { stdin: process.stdin.isTTY, stdout: process.stdout.isTTY };
  const terminalWith = (stdin: boolean, stdout: boolean): boolean => {
    process.stdin.isTTY = stdin;
    process.stdout.isTTY = stdout;
    return processIo().terminal;
  };
  try {
    assert.deepEqual(
      [terminalWith(true, true), terminalWith(true, false), terminalWith(false, true), terminalWith(false, false)],
      [true, false, false, false],
    );
  } finally {
    process.stdin.isTTY = before.stdin;
    process.stdout.isTTY = before.stdout;
  }
});

test("a command hears SIGTERM and SIGINT until it stops listening", () => {
  const listener = (): void => undefined;

  const stopListening = processIo().onStop(listener);
  assert.ok(process.listeners("SIGTERM").includes(listener));
  assert.ok(process.listeners("SIGINT").includes(listener));

  stopListening();
  assert.ok(!process.listeners("SIGTERM").includes(listener));
  assert.ok(!process.listeners("SIGINT").includes(listener));
});
