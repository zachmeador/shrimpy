import assert from "node:assert/strict";
import { test } from "node:test";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { captureIo } from "../testing/index.ts";
import { warnIfVersionDiffers } from "./index.ts";

test("a program of the same version is not mentioned", () => {
  const cli = captureIo();

  warnIfVersionDiffers(cli.io, "the gateway", SHRIMPY_VERSION);

  assert.deepEqual(cli.err, []);
  assert.deepEqual(cli.out, []);
});

test("a program of another version is named on standard error with both versions", () => {
  const cli = captureIo();

  warnIfVersionDiffers(cli.io, "the chat server", "9.9.9");

  assert.deepEqual(cli.err, [
    `Warning: the chat server runs Shrimpy 9.9.9, but this command is ${SHRIMPY_VERSION}. Programs are meant to be upgraded together.`,
  ]);
  assert.deepEqual(cli.out, []);
});
