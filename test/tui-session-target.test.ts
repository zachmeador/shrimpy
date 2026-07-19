import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import { TuiSessionTargetController } from "../dist/tui/session-target.js";
import {
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-tui-target-test-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

test("target controller switches the runtime to a preflighted agent session", async () => {
  const previous = prepared("alpha", "main");
  const requested = prepared("beta", "research");
  const previousFile = writeSession(previous, "previous.jsonl");
  const requestedFile = writeSession(requested, "requested.jsonl");
  const controller = controllerFor(previous, requested);
  controller.updateSession(previousFile, previous.cwd);
  await controller.preflight(summary(requested, requestedFile));
  const opened: string[] = [];

  const result = await controller.createRuntime(
    runtimeInput(requestedFile, previousFile),
    async (target) => {
      opened.push(target.plan.descriptor.key.agentId);
      return { marker: target.plan.descriptor.key.agentId } as any;
    },
  );

  assert.equal((result as any).marker, "beta");
  assert.deepEqual(opened, ["beta"]);
  assert.deepEqual(controller.getTarget(), {
    agentId: "beta",
    sessionId: "local/research",
    purpose: "interactive",
    cwd: requested.cwd,
    sessionFile: requestedFile,
  });
  assert.deepEqual(controller.consumeSwitchResult(), {
    kind: "switched",
    target: controller.getTarget(),
  });
});

test("target controller restores the previous agent session when opening the target fails", async () => {
  const previous = prepared("alpha", "main");
  const requested = prepared("beta", "research");
  const previousFile = writeSession(previous, "previous.jsonl");
  const requestedFile = writeSession(requested, "requested.jsonl");
  const controller = controllerFor(previous, requested);
  controller.updateSession(previousFile, previous.cwd);
  await controller.preflight(summary(requested, requestedFile));
  const opened: string[] = [];

  const result = await controller.createRuntime(
    runtimeInput(requestedFile, previousFile),
    async (target) => {
      const agentId = target.plan.descriptor.key.agentId;
      opened.push(agentId);
      if (agentId === "beta") throw new Error("model unavailable");
      return { marker: agentId } as any;
    },
  );

  assert.equal((result as any).marker, "alpha");
  assert.deepEqual(opened, ["beta", "alpha"]);
  assert.deepEqual(controller.getTarget(), {
    agentId: "alpha",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: previous.cwd,
    sessionFile: previousFile,
  });
  assert.deepEqual(controller.consumeSwitchResult(), {
    kind: "rolled_back",
    target: controller.getTarget(),
    attempted: { agentId: "beta", sessionId: "local/research" },
    error: "model unavailable",
  });
});

test("target controller creates an empty agent local/main through Pi's switch lifecycle", async () => {
  const previous = prepared("alpha", "main");
  const requested = prepared("beta", "main");
  const previousFile = writeSession(previous, "previous.jsonl");
  const controller = controllerFor(previous, requested);
  controller.updateSession(previousFile, previous.cwd);

  const target = await controller.preflightNewAgent("beta");
  assert.equal(target.agentId, "beta");
  assert.equal(target.sessionId, "local/main");
  assert.ok(target.sessionFile);
  assert.equal(existsSync(target.sessionFile), false);

  const opened: Array<{ agentId: string; sessionDir: string; cwd: string }> = [];
  const result = await controller.createRuntime(
    newTargetRuntimeInput(target.sessionFile, previousFile),
    async (next, input) => {
      opened.push({
        agentId: next.plan.descriptor.key.agentId,
        sessionDir: input.sessionManager.getSessionDir(),
        cwd: input.cwd,
      });
      return { marker: next.plan.descriptor.key.agentId } as any;
    },
  );

  assert.equal((result as any).marker, "beta");
  assert.deepEqual(opened, [{
    agentId: "beta",
    sessionDir: requested.plan.descriptor.storage.dir,
    cwd: requested.cwd,
  }]);
  assert.equal(controller.getTarget().agentId, "beta");
  assert.equal(controller.getTarget().sessionId, "local/main");
});

function controllerFor(previous: any, requested: any) {
  return new TuiSessionTargetController({} as any, previous, {
    async prepareTarget() {
      return requested;
    },
    async prepareNewTarget() {
      return requested;
    },
  });
}

function runtimeInput(requestedFile: string, previousFile: string) {
  const manager = SessionManager.open(requestedFile);
  return {
    cwd: manager.getCwd(),
    agentDir: join(workspace, ".shrimpy"),
    sessionManager: manager,
    sessionStartEvent: {
      type: "session_start",
      reason: "resume",
      previousSessionFile: previousFile,
    },
  } as const;
}

function newTargetRuntimeInput(targetFile: string, previousFile: string) {
  const manager = SessionManager.open(targetFile);
  return {
    cwd: manager.getCwd(),
    agentDir: join(workspace, ".shrimpy"),
    sessionManager: manager,
    sessionStartEvent: {
      type: "session_start",
      reason: "resume",
      previousSessionFile: previousFile,
    },
  } as const;
}

function prepared(agentId: string, name: string) {
  const cwd = join(workspace, "agents", agentId);
  return {
    agentId,
    cwd,
    bootstrap: { agentRootPath: cwd },
    plan: {
      descriptor: createSessionDescriptor({
        agentRoot: cwd,
        key: createLocalSessionKey({ agentId, name }),
        purpose: "interactive",
        delivery: { kind: "transcript" },
        cwd,
      }),
    },
  };
}

function writeSession(target: any, name: string): string {
  const sessionDir = target.plan.descriptor.storage.dir;
  mkdirSync(sessionDir, { recursive: true });
  const path = join(sessionDir, name);
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: name,
      timestamp: new Date().toISOString(),
      cwd: target.cwd,
    })}\n`,
    "utf-8",
  );
  return path;
}

function summary(target: any, path: string) {
  return {
    agentId: target.agentId,
    sessionId: `local/${target.plan.descriptor.key.name}`,
    purpose: "interactive",
    path,
    sessionDir: target.plan.descriptor.storage.dir,
    updatedAt: new Date().toISOString(),
    updatedAtMs: Date.now(),
    current: false,
  };
}
