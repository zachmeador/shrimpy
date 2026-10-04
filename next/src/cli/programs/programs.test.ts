import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { stopAfter, useRuntimeDir } from "../../lib/testing/index.ts";
import { type Ended, ProgramEndedError, startProgram } from "./index.ts";

const timeout = 30_000;

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

test("a program is started through the CLI, says where it is, and ends when it is stopped", { timeout }, async (t) => {
  useRuntimeDir(t);
  const said: string[] = [];

  const gateway = await startProgram<{ event: string; socket: string; pid: number }>(
    ["gateway", "serve"],
    (stream, line) => said.push(`${stream}: ${line}`),
  );
  stopAfter(t, async () => {
    await gateway.stop();
  });

  assert.equal(gateway.listening.event, "listening");
  assert.equal(gateway.listening.pid, gateway.pid);
  assert.ok(isAlive(gateway.pid));
  const ended = await gateway.stop();
  assert.deepEqual(ended, { code: 0, signal: null } satisfies Ended);
  assert.equal(await gateway.ended, ended);
  assert.equal(isAlive(gateway.pid), false);
  assert.deepEqual(said, []);
});

test("a program runs in a process group of its own, so the terminal's Ctrl+C reaches only the command that started it", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startProgram(["gateway", "serve"], () => undefined);
  stopAfter(t, async () => {
    await gateway.stop();
  });

  const group = execFileSync("ps", ["-o", "pgid=", "-p", String(gateway.pid)], { encoding: "utf8" });

  assert.equal(Number(group.trim()), gateway.pid);
  assert.notEqual(gateway.pid, process.pid);
});

test("a program that ends before it says it is listening is an error saying how, with what it printed passed on", { timeout }, async () => {
  const said: [string, string][] = [];

  await assert.rejects(
    startProgram(["nope"], (stream, line) => said.push([stream, line])),
    (error) => error instanceof ProgramEndedError && error.ended.code === 2 && error.ended.signal === null,
  );

  assert.deepEqual(said[0], ["err", "Unknown command: nope"]);
  assert.ok(said.length > 1, "the rest of what it printed was passed on too");
});

test("a program whose first line is not JSON is an error, and is stopped", { timeout }, async () => {
  await assert.rejects(startProgram(["help"], () => undefined), /not JSON when it should say it is listening: Usage: shrimpy/);
});

test("a program that was signalled shows the signal that ended it", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startProgram(["gateway", "serve"], () => undefined);
  stopAfter(t, async () => {
    await gateway.stop();
  });

  gateway.signal("SIGKILL");

  assert.deepEqual(await gateway.ended, { code: null, signal: "SIGKILL" });
  gateway.signal("SIGTERM");
});
