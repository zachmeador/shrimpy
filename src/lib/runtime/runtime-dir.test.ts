import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, statSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import { tempDir } from "../testing/index.ts";
import { MAX_SOCKET_PATH_BYTES, namedSocketPath, runtimeDir, socketPathFor } from "./node.ts";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

/** A directory under `base`, named so that a socket called `file` in it has a path of `bytes` bytes. */
function directoryFor(base: string, file: string, bytes: number): string {
  const length = bytes - 1 - file.length;
  return join(base, "d".repeat(length - base.length - 1));
}

test("SHRIMPY_RUNTIME_DIR overrides where sockets go, and the directory is created", (t) => {
  const directory = join(tempDir(t, "runtime"), "sockets");
  process.env.SHRIMPY_RUNTIME_DIR = directory;

  assert.equal(runtimeDir(), directory);
  assert.ok(statSync(directory).isDirectory());
  assert.equal(namedSocketPath("gateway"), join(directory, "gateway.sock"));
});

test("a keyed socket path is stable, differs per key and stays short", (t) => {
  process.env.SHRIMPY_RUNTIME_DIR = tempDir(t, "runtime");
  const long = `/Users/someone/${"deep/".repeat(40)}home`;

  assert.equal(socketPathFor(long), socketPathFor(long));
  assert.notEqual(socketPathFor(long), socketPathFor(`${long}-other`));
  assert.equal(socketPathFor(long).length, namedSocketPath("0123456789abcdef").length);
});

test("a runtime directory that other accounts can open, or that is a symbolic link, is refused wherever its path is asked for", (t) => {
  const base = tempDir(t, "rt");
  const open = join(base, "open");
  mkdirSync(open);
  chmodSync(open, 0o755);
  const link = join(base, "link");
  mkdirSync(join(base, "private"), { mode: 0o700 });
  symlinkSync(join(base, "private"), link);

  for (const directory of [open, link]) {
    process.env.SHRIMPY_RUNTIME_DIR = directory;
    const named = (error: Error): boolean => error.message.includes(directory);
    assert.throws(() => runtimeDir(), named);
    assert.throws(() => namedSocketPath("gateway"), named);
    assert.throws(() => socketPathFor("/a/home"), named);
  }
});

test("a runtime directory too long for a socket is refused, saying what to shorten", (t) => {
  const directory = directoryFor(tempDir(t, "rt"), "gateway.sock", MAX_SOCKET_PATH_BYTES + 7);
  process.env.SHRIMPY_RUNTIME_DIR = directory;

  assert.throws(() => namedSocketPath("gateway"), /too long for a socket.*Shorten SHRIMPY_RUNTIME_DIR by at least 7 bytes/);
  assert.equal(existsSync(directory), false, "a directory that can't be used is not made");
});
