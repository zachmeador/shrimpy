import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "node:util";
import { expectArguments, parsing, UsageError } from "./index.ts";

test("what parseArgs objects to is a usage error with its words", () => {
  assert.throws(
    () => parsing(() => parseArgs({ args: ["--fast"], options: {} })),
    (error) => error instanceof UsageError && /Unknown option '--fast'/.test(error.message),
  );
});

test("a failure that is not about the arguments is left alone", () => {
  const broken = new TypeError("not about arguments");

  assert.throws(
    () =>
      parsing(() => {
        throw broken;
      }),
    (error) => error === broken,
  );
  assert.equal(parsing(() => 7), 7);
});

test("arguments that are all there are handed back in order", () => {
  assert.deepEqual(expectArguments([], []), []);
  assert.deepEqual(expectArguments(["home"], ["<home>"]), ["home"]);
  assert.deepEqual(expectArguments(["home", "text"], ["<home>", "<text>"]), ["home", "text"]);
});

test("a command with no arguments names the first one given, without advice about quotes", () => {
  assert.throws(() => expectArguments(["now"], []), new UsageError("Unexpected argument: now."));
});

test("a missing argument is named, and so is the first one too many", () => {
  assert.throws(() => expectArguments([], ["<home>"]), new UsageError("Missing <home>."));
  assert.throws(() => expectArguments(["home"], ["<home>", "<text>"]), new UsageError("Missing <text>."));
  assert.throws(
    () => expectArguments(["home", "two", "words"], ["<home>", "<text>"]),
    new UsageError("Unexpected argument: words. Put text with spaces in quotes."),
  );
});
