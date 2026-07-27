import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startWebServer } from "../dist/web/server.js";
import { WorkspaceWatcher } from "../dist/web/server/watcher.js";

test("workspace watcher invalidates changed files and new directories", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-live-"));
  await mkdir(join(workspace, "config"), { recursive: true });
  await writeFile(join(workspace, "config", "shrimpy.json"), "{}\n");
  const watcher = new WorkspaceWatcher(workspace);
  await watcher.start();
  try {
    const changed = new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("watch event timed out")), 3_000);
      const unsubscribe = watcher.subscribe((event) => {
        if (!event.paths.some((path) => path.includes("note.md"))) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(event.paths);
      });
    });
    await mkdir(join(workspace, "context"), { recursive: true });
    await writeFile(join(workspace, "context", "note.md"), "live\n");
    await watcher.reconcileNow();
    assert.equal((await changed).some((path) => path.includes("note.md")), true);
  } finally {
    watcher.stop();
  }
});

test("web server stays same-origin, read-only, and emits security headers", async (t) => {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-server-"));
  await mkdir(join(workspace, "config"), { recursive: true });
  await writeFile(join(workspace, "config", "shrimpy.json"), "{}\n");
  let running;
  try {
    running = await startWebServer(
      { workspace, host: "127.0.0.1", port: 0, apiOnly: true },
      { publicDir: null },
    );
  } catch (error) {
    if (
      error instanceof Error
      && "code" in error
      && (error as NodeJS.ErrnoException).code === "EPERM"
    ) {
      t.skip("sandbox does not permit loopback listeners");
      return;
    }
    throw error;
  }
  try {
    const address = running.server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;
    const tree = await fetch(`${origin}/api/tree`);
    assert.equal(tree.status, 200);
    assert.equal(tree.headers.get("access-control-allow-origin"), null);
    assert.equal(tree.headers.get("x-frame-options"), "DENY");
    const body = await tree.json() as { tree?: unknown };
    assert.ok(body.tree);

    const writeAttempt = await fetch(`${origin}/api/tree`, { method: "POST" });
    assert.equal(writeAttempt.status, 405);
  } finally {
    await running.close();
  }
});
