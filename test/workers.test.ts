import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { startWorker, amendWorker, cancelWorker, closeWorker, finalizeWorkerTurn, listWorkerRecords, readWorkerRecord } from "../dist/workers/lifecycle.js";
import { cmdWorker } from "../dist/commands/worker.js";
import {
  buildCodexArgs,
  buildPiWorkerRunResult,
  buildWorkerPrompt,
  extractCodexSessionId,
} from "../dist/workers/runner.js";
import { writeWorkerBackendAvailability } from "../dist/workers/availability.js";
import {
  captureLogs,
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-workers-test-");
  writeWorkerBackendAvailability(workspace, {
    version: 1,
    checkedAt: "2026-06-12T12:00:00.000Z",
    backends: {
      codex: {
        backend: "codex",
        available: false,
        command: "codex",
        authStatus: "unavailable",
        checkedAt: "2026-06-12T12:00:00.000Z",
        problem: "command not found",
      },
      claude: {
        backend: "claude",
        available: true,
        command: "claude",
        authStatus: "unknown",
        checkedAt: "2026-06-12T12:00:00.000Z",
      },
      pi: {
        backend: "pi",
        available: true,
        authStatus: "configured",
        checkedAt: "2026-06-12T12:00:00.000Z",
      },
    },
  });
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("worker records", () => {
  test("records unavailable external backend failures", async () => {
    const worker = await startWorker({
      config: { workspace } as any,
      backend: "codex",
      ownerAgent: "mechanic",
      cwd: workspace,
      goal: "try codex",
      spec: "Inspect the repository.",
    });

    assert.equal(worker.status, "failed");
    assert.equal(worker.backend, "codex");
    assert.equal(worker.ownerAgent, "mechanic");
    assert.match(worker.summary, /codex worker backend is unavailable/);
    assert.equal(worker.turns.length, 1);
    assert.equal(worker.turns[0].status, "failed");
    assert.match(worker.turns[0].error ?? "", /command not found/);
    assert.equal(readWorkerRecord({ workspace } as any, worker.id).id, worker.id);
  });

  test("amends, cancels, closes, and filters worker records", async () => {
    const worker = await startWorker({
      config: { workspace } as any,
      backend: "claude",
      cwd: workspace,
      spec: "Build the thing.",
    });
    assert.equal(worker.status, "failed");
    assert.match(worker.summary, /deferred to P3/);

    const amended = await amendWorker({
      config: { workspace } as any,
      id: worker.id,
      prompt: "Use the fallback.",
    });
    assert.equal(amended.turns.length, 2);
    assert.equal(amended.status, "failed");

    const cancelled = cancelWorker({ workspace } as any, worker.id);
    assert.equal(cancelled.status, "cancelled");

    const closed = closeWorker({ workspace } as any, worker.id);
    assert.equal(closed.status, "closed");
    assert.equal(listWorkerRecords({ workspace } as any).length, 1);
  });

  test("command lists persisted workers as JSON", async () => {
    const worker = await startWorker({
      config: { workspace } as any,
      backend: "codex",
      cwd: workspace,
      spec: "Inspect the repository.",
    });

    const { result, lines } = await captureLogs(() =>
      cmdWorker(["list", "--json"], { workspace } as any)
    );
    const output = JSON.parse(lines.join("\n"));

    assert.equal(result, 0);
    assert.equal(output.length, 1);
    assert.equal(output[0].id, worker.id);
    assert.equal(output[0].status, "failed");
  });

  test("single-worker JSON includes latest turn shortcuts", async () => {
    writeWorkerBackendAvailability(workspace, {
      version: 1,
      checkedAt: "2026-06-12T12:00:00.000Z",
      backends: {
        codex: {
          backend: "codex",
          available: true,
          command: "codex",
          path: "/usr/bin/codex",
          version: "codex 0.139.0",
          authStatus: "unknown",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        claude: {
          backend: "claude",
          available: false,
          command: "claude",
          authStatus: "unavailable",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        pi: {
          backend: "pi",
          available: true,
          authStatus: "configured",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
      },
    });

    const worker = await startWorker({
      config: { workspace } as any,
      backend: "codex",
      cwd: workspace,
      spec: "Inspect the repository.",
      supervisor: {
        launch() {
          return { pid: 12345 };
        },
      },
    });
    const { result, lines } = await captureLogs(() =>
      cmdWorker(["status", worker.id, "--json"], { workspace } as any)
    );
    const output = JSON.parse(lines.join("\n"));

    assert.equal(result, 0);
    assert.equal(output.id, worker.id);
    assert.equal(output.latestTurn.id, worker.turns[0].id);
    assert.equal(output.artifactPaths.logPath, worker.turns[0].logPath);
    assert.equal(output.artifactPaths.outputPath, worker.turns[0].outputPath);
    assert.equal(output.artifactPaths.errorPath, worker.turns[0].errorPath);
    assert.equal(output.commands.tail, `shrimpy worker tail ${worker.id} --follow`);
    assert.equal(output.turns[0].id, worker.turns[0].id);
  });

  test("launches available codex workers as detached running turns", async () => {
    writeWorkerBackendAvailability(workspace, {
      version: 1,
      checkedAt: "2026-06-12T12:00:00.000Z",
      backends: {
        codex: {
          backend: "codex",
          available: true,
          command: "codex",
          path: "/usr/bin/codex",
          version: "codex 0.139.0",
          authStatus: "unknown",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        claude: {
          backend: "claude",
          available: false,
          command: "claude",
          authStatus: "unavailable",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        pi: {
          backend: "pi",
          available: true,
          authStatus: "configured",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
      },
    });
    const launches: Array<{ workerId: string; turnId: string }> = [];

    const worker = await startWorker({
      config: { workspace } as any,
      backend: "codex",
      cwd: workspace,
      spec: "Inspect the repository.",
      supervisor: {
        launch(input) {
          launches.push({ workerId: input.workerId, turnId: input.turnId });
          return { pid: 12345 };
        },
      },
    });

    assert.equal(worker.status, "running");
    assert.equal(worker.turns[0].pid, 12345);
    assert.match(worker.turns[0].logPath ?? "", /runtime\/workers\/wrk_/);
    assert.deepEqual(launches, [{ workerId: worker.id, turnId: worker.turns[0].id }]);

    const finalized = finalizeWorkerTurn({ workspace } as any, worker.id, worker.turns[0].id, {
      status: "complete",
      output: "Done.",
      backendSessionId: "11111111-1111-4111-8111-111111111111",
      exitCode: 0,
      signal: null,
    });

    assert.equal(finalized.status, "complete");
    assert.equal(finalized.backendSessionId, "11111111-1111-4111-8111-111111111111");
    assert.equal(finalized.turns[0].output, "Done.");
  });

  test("launches available pi workers through the shared supervisor", async () => {
    const launches: Array<{ workerId: string; turnId: string }> = [];

    const worker = await startWorker({
      config: { workspace } as any,
      backend: "pi",
      ownerAgent: "shrimpy",
      cwd: workspace,
      spec: "Build the project idea.",
      supervisor: {
        launch(input) {
          launches.push({ workerId: input.workerId, turnId: input.turnId });
          return { pid: 24680 };
        },
      },
    });

    assert.equal(worker.status, "running");
    assert.equal(worker.backend, "pi");
    assert.equal(worker.turns[0].pid, 24680);
    assert.deepEqual(launches, [{ workerId: worker.id, turnId: worker.turns[0].id }]);
  });

  test("close terminates a running worker process group before closing", async () => {
    const originalKill = process.kill;
    const calls: Array<{ pid: number; signal?: string | number }> = [];
    let terminated = false;
    (process as any).kill = (pid: number, signal?: string | number) => {
      calls.push({ pid, signal });
      if ((pid === -33333 || pid === 33333) && signal === 0 && terminated) {
        throw new Error("worker exited");
      }
      if (pid === -33333 && signal === "SIGTERM") {
        terminated = true;
      }
      return true;
    };
    try {
      const worker = await startWorker({
        config: { workspace } as any,
        backend: "pi",
        cwd: workspace,
        spec: "Keep running.",
        supervisor: {
          launch() {
            return { pid: 33333 };
          },
        },
      });

      const closed = closeWorker({ workspace } as any, worker.id);

      assert.equal(closed.status, "closed");
      assert.equal(closed.turns[0].status, "cancelled");
      assert.equal(closed.turns[0].signal, "SIGTERM");
      assert.ok(calls.some((call) => call.pid === -33333 && call.signal === "SIGTERM"));
      assert.equal(calls.some((call) => call.signal === "SIGKILL"), false);
    } finally {
      (process as any).kill = originalKill;
    }
  });

  test("cancel force-kills a worker process group that ignores SIGTERM", async () => {
    const worker = await startWorker({
      config: { workspace } as any,
      backend: "pi",
      cwd: workspace,
      spec: "Keep running.",
      supervisor: {
        launch() {
          return { pid: 55555 };
        },
      },
    });

    const originalKill = process.kill;
    const calls: Array<{ pid: number; signal?: string | number }> = [];
    let forceKilled = false;
    (process as any).kill = (pid: number, signal?: string | number) => {
      calls.push({ pid, signal });
      if ((pid === -55555 || pid === 55555) && signal === 0 && forceKilled) {
        throw new Error("worker killed");
      }
      if (pid === -55555 && signal === "SIGKILL") {
        forceKilled = true;
      }
      return true;
    };
    try {
      const cancelled = cancelWorker({ workspace } as any, worker.id);

      assert.equal(cancelled.status, "cancelled");
      assert.equal(cancelled.turns[0].signal, "SIGKILL");
      assert.ok(calls.some((call) => call.pid === -55555 && call.signal === "SIGTERM"));
      assert.ok(calls.some((call) => call.pid === -55555 && call.signal === "SIGKILL"));
    } finally {
      (process as any).kill = originalKill;
    }
  });

  test("stale reconciliation terminates a leftover worker process group", async () => {
    const worker = await startWorker({
      config: { workspace } as any,
      backend: "pi",
      cwd: workspace,
      spec: "Keep running.",
      supervisor: {
        launch() {
          return { pid: 44444 };
        },
      },
    });

    const originalKill = process.kill;
    const calls: Array<{ pid: number; signal?: string | number }> = [];
    let terminated = false;
    (process as any).kill = (pid: number, signal?: string | number) => {
      calls.push({ pid, signal });
      if (pid === 44444 && signal === 0) {
        throw new Error("missing supervisor");
      }
      if (pid === -44444 && signal === "SIGTERM") {
        terminated = true;
      }
      if (pid === -44444 && signal === 0 && terminated) {
        throw new Error("group exited");
      }
      return true;
    };
    try {
      const reconciled = readWorkerRecord({ workspace } as any, worker.id);

      assert.equal(reconciled.status, "failed");
      assert.match(reconciled.turns[0].error ?? "", /terminated remaining process group/);
      assert.ok(calls.some((call) => call.pid === -44444 && call.signal === "SIGTERM"));
    } finally {
      (process as any).kill = originalKill;
    }
  });

  test("defaults worker cwd to the owner agent projects directory", async () => {
    writeWorkerBackendAvailability(workspace, {
      version: 1,
      checkedAt: "2026-06-12T12:00:00.000Z",
      backends: {
        codex: {
          backend: "codex",
          available: true,
          command: "codex",
          path: "/usr/bin/codex",
          version: "codex 0.139.0",
          authStatus: "unknown",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        claude: {
          backend: "claude",
          available: false,
          command: "claude",
          authStatus: "unavailable",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        pi: {
          backend: "pi",
          available: true,
          authStatus: "configured",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
      },
    });

    const worker = await startWorker({
      config: {
        workspace,
        agents: [
          { id: "shrimpy", root: "agents/shrimpy" },
          { id: "builder", root: "agents/builder" },
        ],
      } as any,
      ownerAgent: "builder",
      backend: "codex",
      spec: "Build the thing.",
      supervisor: {
        launch() {
          return { pid: 12345 };
        },
      },
    });

    assert.equal(worker.cwd, `${workspace}/agents/builder/projects`);
    assert.equal(existsSync(`${workspace}/agents/builder/projects`), true);
  });

  test("records per-turn worker timeouts", async () => {
    writeWorkerBackendAvailability(workspace, {
      version: 1,
      checkedAt: "2026-06-12T12:00:00.000Z",
      backends: {
        codex: {
          backend: "codex",
          available: true,
          command: "codex",
          path: "/usr/bin/codex",
          version: "codex 0.139.0",
          authStatus: "unknown",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        claude: {
          backend: "claude",
          available: false,
          command: "claude",
          authStatus: "unavailable",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        pi: {
          backend: "pi",
          available: true,
          authStatus: "configured",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
      },
    });

    const worker = await startWorker({
      config: { workspace } as any,
      backend: "codex",
      cwd: workspace,
      spec: "Build the thing.",
      timeoutMs: 1234,
      supervisor: {
        launch() {
          return { pid: 12345 };
        },
      },
    });

    assert.equal(worker.turns[0].timeoutMs, 1234);
  });

  test("tails the latest worker turn log", async () => {
    writeWorkerBackendAvailability(workspace, {
      version: 1,
      checkedAt: "2026-06-12T12:00:00.000Z",
      backends: {
        codex: {
          backend: "codex",
          available: true,
          command: "codex",
          path: "/usr/bin/codex",
          version: "codex 0.139.0",
          authStatus: "unknown",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        claude: {
          backend: "claude",
          available: false,
          command: "claude",
          authStatus: "unavailable",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
        pi: {
          backend: "pi",
          available: true,
          authStatus: "configured",
          checkedAt: "2026-06-12T12:00:00.000Z",
        },
      },
    });

    const worker = await startWorker({
      config: { workspace } as any,
      backend: "codex",
      cwd: workspace,
      spec: "Build the thing.",
      supervisor: {
        launch() {
          return { pid: 12345 };
        },
      },
    });
    const logPath = worker.turns[0].logPath;
    assert.ok(logPath);
    writeFileSync(logPath, "one\ntwo\nthree\n", "utf-8");

    const { result, lines } = await captureLogs(() =>
      cmdWorker(["tail", worker.id, "--lines", "2"], { workspace } as any)
    );

    assert.equal(result, 0);
    assert.deepEqual(lines, ["two\nthree"]);
  });

  test("builds codex args with review approvals and full filesystem access", () => {
    const args = buildCodexArgs({
      cwd: "/tmp/project",
      outputPath: "/tmp/worker.last-message.md",
    });

    assert.deepEqual(args, [
      "exec",
      "-c",
      "approval_policy=\"on-request\"",
      "-c",
      "approvals_reviewer=\"auto_review\"",
      "-c",
      "sandbox_mode=\"danger-full-access\"",
      "--skip-git-repo-check",
      "--json",
      "--output-last-message",
      "/tmp/worker.last-message.md",
      "--cd",
      "/tmp/project",
      "-",
    ]);
    assert.equal(args.includes("approval_policy=\"never\""), false);
    assert.equal(args.includes("sandbox_mode=\"workspace-write\""), false);
  });

  test("builds codex resume args without overriding cwd", () => {
    const args = buildCodexArgs({
      backendSessionId: "11111111-1111-4111-8111-111111111111",
      cwd: "/tmp/project",
      outputPath: "/tmp/worker.last-message.md",
    });

    assert.deepEqual(args, [
      "exec",
      "resume",
      "-c",
      "approval_policy=\"on-request\"",
      "-c",
      "approvals_reviewer=\"auto_review\"",
      "-c",
      "sandbox_mode=\"danger-full-access\"",
      "--skip-git-repo-check",
      "--json",
      "--output-last-message",
      "/tmp/worker.last-message.md",
      "11111111-1111-4111-8111-111111111111",
      "-",
    ]);
    assert.equal(args.includes("--cd"), false);
  });

  test("prepends shrimpy context to codex worker prompts", () => {
    const prompt = buildWorkerPrompt("Build the requested feature.");

    assert.match(prompt, /^You are running as a Shrimpy coding worker\./);
    assert.match(prompt, /Shrimpy source checkout: .*\/shrimpy/);
    assert.match(prompt, /Shrimpy source: .*\/shrimpy\/src/);
    assert.match(prompt, /Shrimpy docs: .*\/shrimpy\/docs/);
    assert.match(prompt, /Worker cwd is the target project directory/);
    assert.match(prompt, /\n\nBuild the requested feature\.$/);
  });

  test("extracts codex session ids from JSONL output", () => {
    assert.equal(
      extractCodexSessionId([
        JSON.stringify({ type: "event", message: "starting" }),
        JSON.stringify({ type: "session", session_id: "11111111-1111-4111-8111-111111111111" }),
      ].join("\n")),
      "11111111-1111-4111-8111-111111111111",
    );
    assert.equal(
      extractCodexSessionId(
        JSON.stringify({
          type: "event",
          nested: {
            conversationId: "22222222-2222-4222-8222-222222222222",
          },
        }),
      ),
      "22222222-2222-4222-8222-222222222222",
    );
    assert.equal(extractCodexSessionId("not-json\n{}"), undefined);
  });

  test("maps pi direct-session output into worker run results", () => {
    assert.deepEqual(
      buildPiWorkerRunResult({
        output: "Built the demo.",
        backendSessionId: "wrk_done",
      }),
      {
        status: "complete",
        output: "Built the demo.",
        backendSessionId: "wrk_done",
        exitCode: 0,
        signal: null,
      },
    );
    assert.deepEqual(
      buildPiWorkerRunResult({
        output: "Blocked: missing API token.",
        backendSessionId: "wrk_blocked",
      }),
      {
        status: "blocked",
        output: "Blocked: missing API token.",
        backendSessionId: "wrk_blocked",
        exitCode: 0,
        signal: null,
      },
    );
  });
});
