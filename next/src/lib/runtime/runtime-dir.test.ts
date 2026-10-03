import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { tempDir } from "../testing/index.ts";
import { namedSocketPath, runtimeDir, socketPathFor } from "./runtime-dir.ts";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

test("SHRIMPY_RUNTIME_DIR overrides where sockets go, and the directory is created", (t) => {
  const directory = join(tempDir(t, "runtime"), "sockets");
  process.env.SHRIMPY_RUNTIME_DIR = directory;

  assert.equal(runtimeDir(), directory);
  assert.ok(statSync(directory).isDirectory());
  assert.equal(namedSocketPath("gateway"), join(directory, "gateway.sock"));
});

test("without an override, XDG_RUNTIME_DIR is used when the system sets it", (t) => {
  const xdg = tempDir(t, "xdg");
  delete process.env.SHRIMPY_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = xdg;

  assert.equal(runtimeDir(), join(xdg, "shrimpy"));
});

test("a keyed socket path is stable, differs per key and stays short", (t) => {
  process.env.SHRIMPY_RUNTIME_DIR = tempDir(t, "runtime");
  const long = `/Users/someone/${"deep/".repeat(40)}home`;

  assert.equal(socketPathFor(long), socketPathFor(long));
  assert.notEqual(socketPathFor(long), socketPathFor(`${long}-other`));
  assert.equal(socketPathFor(long).length, namedSocketPath("0123456789abcdef").length);
});

test("the default location is short enough for a Unix socket", () => {
  delete process.env.SHRIMPY_RUNTIME_DIR;
  delete process.env.XDG_RUNTIME_DIR;

  assert.ok(Buffer.byteLength(socketPathFor("/any/home")) < 100);
});
