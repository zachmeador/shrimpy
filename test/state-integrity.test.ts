import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { lockSync } from "proper-lockfile";
import { withFileTransactionLock } from "../dist/util/file-lock.js";
import {
  appendWorker,
  readWorkers,
  writeWorkers,
} from "../dist/workers/store.js";
import { finalizeWorkerTurn } from "../dist/workers/service.js";
import {
  acquireSessionLease,
  readSessionOwner,
} from "../dist/sessions/ownership.js";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";

const WORKER_STORE_URL = new URL("../dist/workers/store.js", import.meta.url).href;
const SESSION_OWNERSHIP_URL = new URL(
  "../dist/sessions/ownership.js",
  import.meta.url,
).href;
const SESSION_IDENTITY_URL = new URL(
  "../dist/sessions/identity.js",
  import.meta.url,
).href;
const SESSION_SPEC_URL = new URL("../dist/sessions/spec.js", import.meta.url).href;
const CHILD_TIMEOUT_MS = 10_000;

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-state-integrity-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("file transaction locks", () => {
  test("reports bounded lock timeouts with the target path", () => {
    const targetPath = join(workspace, "state", "workers.json");
    mkdirSync(join(workspace, "state"), { recursive: true });
    const release = lockSync(targetPath, { realpath: false, stale: 10_000 });
    let nowMs = 0;
    try {
      assert.throws(
        () =>
          withFileTransactionLock(targetPath, () => {}, {
            timeoutMs: 50,
            minRetryMs: 25,
            maxRetryMs: 25,
            now: () => nowMs,
            random: () => 0,
            sleep: (ms) => {
              nowMs += ms;
            },
          }),
        new RegExp(`timed out after 50ms.*${escapeRegExp(targetPath)}`),
      );
    } finally {
      release();
    }
  });

  test("reclaims stale locks and releases after the operation", () => {
    const targetPath = join(workspace, "state", "workers.json");
    const lockPath = `${targetPath}.lock`;
    mkdirSync(lockPath, { recursive: true });
    const staleDate = new Date(Date.now() - 5_000);
    utimesSync(lockPath, staleDate, staleDate);

    const result = withFileTransactionLock(targetPath, () => 42, {
      staleMs: 2_000,
    });

    assert.equal(result, 42);
    assert.equal(existsSync(lockPath), false);
  });
});

describe("worker state transactions", () => {
  test("preserves two concurrent finalizations whose mutations overlap", async () => {
    const statePath = join(workspace, "state", "workers.json");
    const barriersPath = join(workspace, "barriers");
    mkdirSync(barriersPath, { recursive: true });
    writeWorkers(statePath, {
      version: 1,
      workers: [workerRecord("a"), workerRecord("b")],
    });
    const childCode = `
      import { writeFileSync, readdirSync } from "node:fs";
      import { join } from "node:path";
      import { updateWorker } from ${JSON.stringify(WORKER_STORE_URL)};
      const [statePath, barriersPath, id] = process.argv.slice(1);
      updateWorker(statePath, id, (current) => {
        writeFileSync(join(barriersPath, id), "ready");
        const deadline = Date.now() + 750;
        while (readdirSync(barriersPath).length < 2 && Date.now() < deadline) {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
        return {
          ...current,
          status: "complete",
          summary: "completed-" + id,
          turns: current.turns.map((turn) => ({
            ...turn,
            status: "complete",
            finishedAt: "2026-07-13T00:00:00.000Z",
          })),
        };
      });
    `;

    await Promise.all([
      runNode(childCode, [statePath, barriersPath, "a"]),
      runNode(childCode, [statePath, barriersPath, "b"]),
    ]);

    assert.deepEqual(
      readWorkers(statePath).workers.map((worker) => [
        worker.id,
        worker.status,
        worker.summary,
      ]),
      [
        ["a", "complete", "completed-a"],
        ["b", "complete", "completed-b"],
      ],
    );
  });

  test("preserves concurrent worker appends and rejects duplicate ids", async () => {
    const statePath = join(workspace, "state", "workers.json");
    const barriersPath = join(workspace, "append-barriers");
    const startPath = join(workspace, "append-start");
    mkdirSync(barriersPath, { recursive: true });
    writeWorkers(statePath, { version: 1, workers: [] });
    const childCode = `
      import { existsSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      import { appendWorker } from ${JSON.stringify(WORKER_STORE_URL)};
      const [statePath, barriersPath, startPath, prefix] = process.argv.slice(1);
      writeFileSync(join(barriersPath, prefix), "ready");
      while (!existsSync(startPath)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      for (let index = 0; index < 5; index += 1) {
        const id = prefix + index;
        appendWorker(statePath, {
          id,
          ownerAgent: "shrimpy",
          backend: "codex",
          cwd: ${JSON.stringify(workspace)},
          goal: id,
          spec: id,
          parent: {},
          status: "running",
          createdAt: "2026-07-13T00:00:00.000Z",
          updatedAt: "2026-07-13T00:00:00.000Z",
          turns: [{
            id: id + "_turn_1",
            kind: "start",
            prompt: id,
            status: "running",
            startedAt: "2026-07-13T00:00:00.000Z",
          }],
          summary: "running",
        });
      }
    `;
    const first = startNode(childCode, [
      statePath,
      barriersPath,
      startPath,
      "a",
    ]);
    const second = startNode(childCode, [
      statePath,
      barriersPath,
      startPath,
      "b",
    ]);
    await waitFor(() => readdirSync(barriersPath).length === 2);
    writeFileSync(startPath, "start");
    await Promise.all([first.completion, second.completion]);

    const workers = readWorkers(statePath).workers;
    assert.deepEqual(
      workers.map((worker) => worker.id).sort(),
      ["a0", "a1", "a2", "a3", "a4", "b0", "b1", "b2", "b3", "b4"],
    );
    assert.throws(
      () => appendWorker(statePath, workers[0]),
      /worker already exists/,
    );
  });

  test("late supervisor results do not resurrect cancelled or closed turns", () => {
    const statePath = join(workspace, "state", "workers.json");
    const cancelled = workerRecord("cancelled", "cancelled");
    const closed = workerRecord("closed", "closed");
    writeWorkers(statePath, { version: 1, workers: [cancelled, closed] });

    for (const worker of [cancelled, closed]) {
      const result = finalizeWorkerTurn(
        { workspace } as any,
        worker.id,
        worker.turns[0].id,
        { status: "complete", output: "late result" },
      );
      assert.equal(result.status, worker.status);
      assert.equal(result.turns[0].status, worker.turns[0].status);
      assert.equal(result.turns[0].output, undefined);
    }
  });
});

describe("session ownership transactions", () => {
  test("racing stale-lease replacements produce exactly one live owner", async () => {
    await seedStaleSessionOwner(workspace);
    const barriersPath = join(workspace, "session-race");
    const startPath = join(barriersPath, "start");
    const releasePath = join(barriersPath, "release");
    mkdirSync(barriersPath, { recursive: true });
    const racers = ["a", "b"].map((id) =>
      startNode(sessionAcquirerCode(), [
        workspace,
        id,
        barriersPath,
        startPath,
        releasePath,
      ])
    );
    await waitFor(() =>
      ["a", "b"].every((id) => existsSync(join(barriersPath, `${id}.ready`)))
    );
    writeFileSync(startPath, "start");
    await waitFor(() =>
      ["a", "b"].every((id) => existsSync(join(barriersPath, `${id}.result`)))
    );

    const results = ["a", "b"].map((id) =>
      readFileSync(join(barriersPath, `${id}.result`), "utf-8")
    );
    assert.equal(results.filter((result) => result.startsWith("won:")).length, 1);
    assert.equal(results.filter((result) => result.startsWith("lost:")).length, 1);
    const winningToken = results.find((result) => result.startsWith("won:"))!
      .slice("won:".length);
    assert.equal(readSessionOwner(workspace, localSessionKey())?.token, winningToken);

    writeFileSync(releasePath, "release");
    await Promise.all(racers.map((racer) => racer.completion));
    assert.equal(readSessionOwner(workspace, localSessionKey()), undefined);
  });

  test("stale cleanup racing acquisition preserves the new live owner", async () => {
    await seedStaleSessionOwner(workspace);
    const barriersPath = join(workspace, "session-reader-race");
    const startPath = join(barriersPath, "start");
    const releasePath = join(barriersPath, "release");
    mkdirSync(barriersPath, { recursive: true });
    const acquirer = startNode(sessionAcquirerCode(), [
      workspace,
      "acquirer",
      barriersPath,
      startPath,
      releasePath,
    ]);
    const readerCode = `
      import { existsSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      import { readSessionOwner } from ${JSON.stringify(SESSION_OWNERSHIP_URL)};
      import { createLocalSessionKey } from ${JSON.stringify(SESSION_IDENTITY_URL)};
      const [workspace, barriersPath, startPath] = process.argv.slice(1);
      writeFileSync(join(barriersPath, "reader.ready"), "ready");
      while (!existsSync(startPath)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      const owner = readSessionOwner(
        workspace,
        createLocalSessionKey({ agentId: "shrimpy", name: "main" }),
      );
      writeFileSync(join(barriersPath, "reader.result"), owner?.token ?? "none");
    `;
    const reader = startNode(readerCode, [workspace, barriersPath, startPath]);
    await waitFor(() =>
      existsSync(join(barriersPath, "acquirer.ready")) &&
      existsSync(join(barriersPath, "reader.ready"))
    );
    writeFileSync(startPath, "start");
    await Promise.all([
      reader.completion,
      waitFor(() => existsSync(join(barriersPath, "acquirer.result"))),
    ]);

    const result = readFileSync(
      join(barriersPath, "acquirer.result"),
      "utf-8",
    );
    assert.match(result, /^won:/);
    const winningToken = result.slice("won:".length);
    assert.equal(readSessionOwner(workspace, localSessionKey())?.token, winningToken);

    writeFileSync(releasePath, "release");
    await acquirer.completion;
  });

  test("an old release token cannot remove its replacement", () => {
    const descriptor = localSessionDescriptor(workspace);
    const first = acquireSessionLease({ workspace, descriptor });
    assert.ok(first);
    first.release();
    const replacement = acquireSessionLease({ workspace, descriptor });
    assert.ok(replacement);

    first.release();
    assert.equal(
      readSessionOwner(workspace, descriptor.key)?.token,
      replacement.owner.token,
    );
    replacement.release();
    assert.equal(readSessionOwner(workspace, descriptor.key), undefined);
  });
});

function workerRecord(
  id: string,
  status: "running" | "cancelled" | "closed" = "running",
) {
  const turnStatus = status === "closed" ? "cancelled" : status;
  return {
    id,
    ownerAgent: "shrimpy",
    backend: "codex" as const,
    cwd: workspace,
    goal: id,
    spec: id,
    parent: {},
    status,
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    ...(status === "closed"
      ? { closedAt: "2026-07-13T00:00:01.000Z" }
      : {}),
    turns: [{
      id: `${id}_turn_1`,
      kind: "start" as const,
      prompt: id,
      status: turnStatus,
      startedAt: "2026-07-13T00:00:00.000Z",
      ...(status === "running"
        ? {}
        : { finishedAt: "2026-07-13T00:00:01.000Z" }),
    }],
    summary: status,
  };
}

function localSessionKey() {
  return createLocalSessionKey({ agentId: "shrimpy", name: "main" });
}

function localSessionDescriptor(root: string) {
  return createSessionDescriptor({
    agentRoot: join(root, "agents", "shrimpy"),
    key: localSessionKey(),
    purpose: "interactive",
    delivery: { kind: "transcript" },
  });
}

async function seedStaleSessionOwner(root: string): Promise<void> {
  const code = `
    import { acquireSessionLease } from ${JSON.stringify(SESSION_OWNERSHIP_URL)};
    import { createLocalSessionKey } from ${JSON.stringify(SESSION_IDENTITY_URL)};
    import { createSessionDescriptor } from ${JSON.stringify(SESSION_SPEC_URL)};
    const [workspace] = process.argv.slice(1);
    acquireSessionLease({
      workspace,
      descriptor: createSessionDescriptor({
        agentRoot: workspace + "/agents/shrimpy",
        key: createLocalSessionKey({ agentId: "shrimpy", name: "main" }),
        purpose: "interactive",
        delivery: { kind: "transcript" },
      }),
    });
  `;
  await runNode(code, [root]);
}

function sessionAcquirerCode(): string {
  return `
    import { existsSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    import { acquireSessionLease } from ${JSON.stringify(SESSION_OWNERSHIP_URL)};
    import { createLocalSessionKey } from ${JSON.stringify(SESSION_IDENTITY_URL)};
    import { createSessionDescriptor } from ${JSON.stringify(SESSION_SPEC_URL)};
    const [workspace, id, barriersPath, startPath, releasePath] = process.argv.slice(1);
    writeFileSync(join(barriersPath, id + ".ready"), "ready");
    while (!existsSync(startPath)) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
    try {
      const lease = acquireSessionLease({
        workspace,
        descriptor: createSessionDescriptor({
          agentRoot: workspace + "/agents/shrimpy",
          key: createLocalSessionKey({ agentId: "shrimpy", name: "main" }),
          purpose: "interactive",
          delivery: { kind: "transcript" },
        }),
      });
      writeFileSync(join(barriersPath, id + ".result"), "won:" + lease.owner.token);
      while (!existsSync(releasePath)) {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
      lease.release();
    } catch (error) {
      writeFileSync(
        join(barriersPath, id + ".result"),
        "lost:" + (error instanceof Error ? error.message : String(error)),
      );
    }
  `;
}

function startNode(
  code: string,
  args: string[],
): { child: ChildProcess; completion: Promise<void> } {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", code, ...args],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });
  const completion = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`child timed out\nstdout: ${stdout}\nstderr: ${stderr}`));
    }, CHILD_TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `child exited with code ${code} signal ${signal}\nstdout: ${stdout}\nstderr: ${stderr}`,
          ),
        );
      }
    });
  });
  return { child, completion };
}

function runNode(code: string, args: string[]): Promise<void> {
  return startNode(code, args).completion;
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("timed out waiting for child state");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
