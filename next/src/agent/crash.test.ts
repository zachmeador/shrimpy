import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { stopAfter, tempDir, useRuntimeDir, waitForView } from "../lib/testing/index.ts";
import {
  answered,
  assistantItems,
  attachMain,
  loggedRequests,
  startAgentChild,
  toolItems,
} from "./testing/index.ts";

const timeout = 60_000;

test("killed while the model streams: the request is sent again", { timeout }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "crash");
  const first = await startAgentChild(t, home, "stream", 40);
  const before = await attachMain(home);
  await before.session.steer("stream a long answer", "request-1");
  await waitForView(before.session, (view) => (assistantItems(view).at(-1)?.text.length ?? 0) >= 60);
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);

  await startAgentChild(t, home, "stream", 4000);
  const after = await attachMain(home);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  assert.deepEqual(
    view.items.map((item) => item.type),
    ["user", "assistant", "assistant"],
  );
  const [partial, complete] = assistantItems(view);
  assert.equal(partial?.stopReason, "aborted");
  assert.ok(partial.text.startsWith("line 01"));
  assert.ok(complete?.text.endsWith("line 40: the quick brown fox jumps over the lazy dog"));

  const sent = loggedRequests(home);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0]?.pid, sent[1]?.pid);
  assert.equal(sent[0]?.digest, sent[1]?.digest);
});

test("killed while a tool runs: the tool is reported, not run again", { timeout }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "crash");
  stopAfter(t, () => stopOrphanedShell(home));
  const first = await startAgentChild(t, home, "tool", 400);
  const before = await attachMain(home);
  await before.session.steer("run the slow command", "request-1");
  await waitForView(before.session, (view) => {
    const tool = toolItems(view)[0];
    return tool?.status === "running" && tool.output.includes("started");
  });
  await first.kill("SIGKILL");
  await before.connection.close().catch(() => undefined);

  await startAgentChild(t, home, "tool", 400);
  const after = await attachMain(home);
  const view = await waitForView(after.session, answered);
  await after.connection.close();

  const tool = toolItems(view)[0];
  assert.equal(tool?.status, "interrupted");
  assert.equal(tool.output, "started");
  assert.ok(assistantItems(view).at(-1)?.text.includes("isError=true"));

  const attempts = readFileSync(join(home, "runs.log"), "utf8")
    .split("\n")
    .filter((line) => line === "attempt");
  assert.equal(attempts.length, 1);
});

/** The killed agent's shell command keeps running on its own; stop it so the test leaves nothing behind. */
function stopOrphanedShell(home: string): void {
  const file = join(home, "child.pid");
  if (!existsSync(file)) return;
  try {
    // The shell leads its own process group, so this also stops its `sleep`.
    process.kill(-Number(readFileSync(file, "utf8").trim()), "SIGKILL");
  } catch {
    // It already finished.
  }
}
