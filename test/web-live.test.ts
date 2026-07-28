import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { startWebServer } from "../dist/web/server.js";
import { WorkspaceWatcher } from "../dist/web/server/watcher.js";

test("workspace watcher invalidates scoped workspace and agent files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "shrimpy-web-live-"));
  await mkdir(join(workspace, "config"), { recursive: true });
  await writeFile(join(workspace, "config", "shrimpy.json"), "{}\n");
  const watcher = new WorkspaceWatcher(workspace);
  await watcher.start();
  try {
    const changed = new Promise<string[]>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("watch event timed out")), 3_000);
      const seen = new Set<string>();
      const unsubscribe = watcher.subscribe((event) => {
        for (const path of event.paths) {
          for (const name of [
            "workspace-note.md",
            "workspace-skill.md",
            "agent-note.md",
            "agent-skill.md",
          ]) {
            if (path.includes(name)) seen.add(name);
          }
        }
        if (seen.size < 4) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve([...seen]);
      });
    });
    await mkdir(join(workspace, "context"), { recursive: true });
    await mkdir(join(workspace, "skills", "test"), { recursive: true });
    await mkdir(
      join(workspace, "agents", "shrimpy", "context"),
      { recursive: true },
    );
    await mkdir(
      join(workspace, "agents", "shrimpy", "skills", "test"),
      { recursive: true },
    );
    await Promise.all([
      writeFile(
        join(workspace, "context", "workspace-note.md"),
        "live\n",
      ),
      writeFile(
        join(workspace, "skills", "test", "workspace-skill.md"),
        "live\n",
      ),
      writeFile(
        join(workspace, "agents", "shrimpy", "context", "agent-note.md"),
        "live\n",
      ),
      writeFile(
        join(
          workspace,
          "agents",
          "shrimpy",
          "skills",
          "test",
          "agent-skill.md",
        ),
        "live\n",
      ),
    ]);
    await watcher.reconcileNow();
    assert.deepEqual(
      (await changed).sort(),
      [
        "agent-note.md",
        "agent-skill.md",
        "workspace-note.md",
        "workspace-skill.md",
      ],
    );
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
