import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
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

test("a socket path of the longest length is accepted", (t) => {
  const directory = directoryFor(tempDir(t, "rt"), "gateway.sock", MAX_SOCKET_PATH_BYTES);
  process.env.SHRIMPY_RUNTIME_DIR = directory;

  const path = namedSocketPath("gateway");

  assert.equal(Buffer.byteLength(path), MAX_SOCKET_PATH_BYTES);
  assert.ok(statSync(directory).isDirectory());
});

test("a runtime directory too long for a socket is refused, saying what to shorten", (t) => {
  const directory = directoryFor(tempDir(t, "rt"), "gateway.sock", MAX_SOCKET_PATH_BYTES + 7);
  process.env.SHRIMPY_RUNTIME_DIR = directory;

  assert.throws(
    () => namedSocketPath("gateway"),
    new Error(
      `The runtime directory ${directory} is too long for a socket: ${join(directory, "gateway.sock")} is 111 bytes, ` +
        "and a Unix socket path holds at most 104. " +
        "Shorten SHRIMPY_RUNTIME_DIR by at least 7 bytes, or set SHRIMPY_RUNTIME_DIR to a shorter directory.",
    ),
  );
  assert.equal(existsSync(directory), false, "a directory that can't be used is not made");
});

test("a path built from a key is held to the same limit", (t) => {
  const base = tempDir(t, "rt");
  process.env.SHRIMPY_RUNTIME_DIR = directoryFor(base, "0123456789abcdef.sock", MAX_SOCKET_PATH_BYTES + 1);

  assert.throws(() => socketPathFor("/any/home"), /is too long for a socket: .* is 105 bytes/);
});

test("the message names the setting that put the directory where it is", (t) => {
  const xdg = tempDir(t, "xdg");
  delete process.env.SHRIMPY_RUNTIME_DIR;
  process.env.XDG_RUNTIME_DIR = join(xdg, "x".repeat(MAX_SOCKET_PATH_BYTES));

  assert.throws(
    () => namedSocketPath("chat"),
    /Shorten XDG_RUNTIME_DIR by at least \d+ bytes, or set SHRIMPY_RUNTIME_DIR to a shorter directory\.$/,
  );
});

test("a directory that is too long is refused for every program that asks for a socket", (t) => {
  process.env.SHRIMPY_RUNTIME_DIR = directoryFor(tempDir(t, "rt"), "chat.sock", MAX_SOCKET_PATH_BYTES + 1);

  for (const name of ["gateway", "gateway-listing", "chat"]) {
    assert.throws(() => namedSocketPath(name), /is too long for a socket/, name);
  }
});
