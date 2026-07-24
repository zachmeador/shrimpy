import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../dist/app/runtime.js";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import { ensureSessionManifest } from "../dist/sessions/manifest.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import { createAgentSessionNavigatorExtensionFactory } from "../dist/tui/session-navigator.js";
import {
  makeTempWorkspace,
  removeTempWorkspace,
  setupInit,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  initTheme("dark", false);
  workspace = makeTempWorkspace("shrimpy-agent-navigator-test-");
  setupInit(workspace);
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

test("/agents switches through the selector and reports the fresh live target", async () => {
  const fixture = navigatorFixture();
  const registered = registerNavigator(fixture.runtime, fixture.target);
  const notifications: Array<[string, string]> = [];
  const switched: string[] = [];

  await registered.command.handler("", {
    mode: "tui",
    async waitForIdle() {},
    ui: {
      custom: selectBetaSession,
      notify(message: string, kind: string) {
        notifications.push([message, kind]);
      },
    },
    async switchSession(path: string, options: any) {
      switched.push(path);
      fixture.target.current = {
        agentId: "beta",
        sessionId: "local/main",
        purpose: "interactive",
        cwd: join(workspace, "agents", "beta"),
        sessionFile: fixture.betaPath,
      };
      await options.withSession({
        ui: {
          notify(message: string, kind: string) {
            notifications.push([message, kind]);
          },
        },
      });
    },
  });

  assert.deepEqual(fixture.target.preflighted, [fixture.betaPath]);
  assert.deepEqual(switched, [fixture.betaPath]);
  assert.deepEqual(notifications, [["Switched to beta · local/main", "info"]]);
  assert.deepEqual(
    registered.command.getArgumentCompletions("b"),
    [{ value: "beta", label: "beta" }],
  );
});

test("/agents switches between active sessions owned by the same agent", async () => {
  const fixture = navigatorFixture();
  const { command } = registerNavigator(fixture.runtime, fixture.target);
  const switched: string[] = [];

  await command.handler("alpha", {
    mode: "tui",
    async waitForIdle() {},
    ui: {
      custom: selectAlphaResearch,
      notify() {},
    },
    async switchSession(path: string, options: any) {
      switched.push(path);
      fixture.target.current = {
        agentId: "alpha",
        sessionId: "local/research",
        purpose: "interactive",
        cwd: join(workspace, "agents", "alpha"),
        sessionFile: fixture.alphaResearchPath,
      };
      await options.withSession({ ui: { notify() {} } });
    },
  });

  assert.deepEqual(fixture.target.preflighted, [fixture.alphaResearchPath]);
  assert.deepEqual(switched, [fixture.alphaResearchPath]);
});

test("/agents opens local/main when the selected agent has no sessions", async () => {
  const fixture = navigatorFixture();
  const { command } = registerNavigator(fixture.runtime, fixture.target);
  const notifications: Array<[string, string]> = [];
  let newSessions = 0;
  let switches = 0;

  await command.handler("empty", {
    mode: "tui",
    async waitForIdle() {},
    ui: {
      custom: selectFocusedRow,
      notify(message: string, kind: string) {
        notifications.push([message, kind]);
      },
    },
    async newSession() {
      newSessions += 1;
    },
    async switchSession(_path: string, options: any) {
      switches += 1;
      fixture.target.current = {
        agentId: "empty",
        sessionId: "local/main",
        purpose: "interactive",
        cwd: join(workspace, "agents", "empty"),
        sessionFile: join(workspace, "agents", "empty", "new.jsonl"),
      };
      await options.withSession({
        ui: {
          notify(message: string, kind: string) {
            notifications.push([message, kind]);
          },
        },
      });
      return { cancelled: false };
    },
  });

  assert.equal(newSessions, 0);
  assert.equal(switches, 1);
  assert.deepEqual(fixture.target.newPreflighted, ["empty"]);
  assert.equal(fixture.target.cancelledNew, 1);
  assert.deepEqual(notifications, [["Opened empty · local/main", "info"]]);
});

test("/agents leaves the current selection as a no-op", async () => {
  const fixture = navigatorFixture();
  const { command } = registerNavigator(fixture.runtime, fixture.target);
  let switched = 0;

  await command.handler("alpha", {
    mode: "tui",
    async waitForIdle() {},
    ui: {
      custom: selectCurrentSession,
      notify() {},
    },
    async switchSession() {
      switched += 1;
    },
  });

  assert.deepEqual(fixture.target.preflighted, []);
  assert.equal(switched, 0);
});

test("/agents preflights before asking Pi to replace the active runtime", async () => {
  const fixture = navigatorFixture();
  fixture.target.preflightError = new Error("agent model unavailable");
  const { command } = registerNavigator(fixture.runtime, fixture.target);
  const notifications: Array<[string, string]> = [];
  let switched = 0;

  await command.handler("", {
    mode: "tui",
    async waitForIdle() {},
    ui: {
      custom: selectBetaSession,
      notify(message: string, kind: string) {
        notifications.push([message, kind]);
      },
    },
    async switchSession() {
      switched += 1;
    },
  });

  assert.equal(switched, 0);
  assert.deepEqual(notifications, [[
    "Cannot open beta local/main: agent model unavailable",
    "error",
  ]]);
});

test("navigator updates the live target from each session_start", () => {
  const fixture = navigatorFixture();
  const registered = registerNavigator(fixture.runtime, fixture.target);
  fixture.target.current = {
    agentId: "beta",
    sessionId: "local/main",
    purpose: "interactive",
    cwd: join(workspace, "agents", "beta"),
  };

  registered.sessionStart({}, {
    mode: "tui",
    sessionManager: {
      getSessionFile: () => fixture.betaPath,
      getCwd: () => join(workspace, "agents", "beta"),
    },
    ui: {},
  });

  assert.equal(fixture.target.current.sessionFile, fixture.betaPath);
});

function registerNavigator(runtime: any, target: any) {
  let command: any;
  let sessionStart: any;
  createAgentSessionNavigatorExtensionFactory({ runtime, target })({
    on(event: string, handler: Function) {
      if (event === "session_start") sessionStart = handler;
    },
    registerCommand(name: string, value: any) {
      assert.equal(name, "agents");
      command = value;
    },
  } as never);
  return { command, sessionStart };
}

async function selectBetaSession(factory: Function) {
  return new Promise((resolve) => {
    const selector = factory(testTui(), identityTheme, {}, resolve);
    selector.handleInput("\x1b[B");
    selector.handleInput("\x1b[B");
    selector.handleInput("\x1b[C");
    selector.handleInput("\r");
  });
}

async function selectAlphaResearch(factory: Function) {
  return new Promise((resolve) => {
    const selector = factory(testTui(), identityTheme, {}, resolve);
    selector.handleInput("\x1b[B");
    selector.handleInput("\r");
  });
}

async function selectCurrentSession(factory: Function) {
  return new Promise((resolve) => {
    const selector = factory(testTui(), identityTheme, {}, resolve);
    selector.handleInput("\r");
  });
}

async function selectFocusedRow(factory: Function) {
  return new Promise((resolve) => {
    const selector = factory(testTui(), identityTheme, {}, resolve);
    selector.handleInput("\r");
  });
}

function testTui() {
  return { terminal: { rows: 40 } };
}

const identityTheme = {
  bold(text: string) {
    return text;
  },
  fg(_color: string, text: string) {
    return text;
  },
};

function navigatorFixture() {
  const config = {
    workspace,
    agents: [
      { id: "alpha", root: "agents/alpha" },
      { id: "beta", root: "agents/beta" },
      { id: "empty", root: "agents/empty" },
    ],
  };
  const alphaPath = writeLocalSession("alpha", "main", "Alpha session");
  const alphaResearchPath = writeLocalSession("alpha", "research", "Alpha research");
  const betaPath = writeLocalSession("beta", "main", "Beta session");
  const target = {
    current: {
      agentId: "alpha",
      sessionId: "local/main",
      purpose: "interactive",
      cwd: join(workspace, "agents", "alpha"),
      sessionFile: alphaPath,
    },
    preflighted: [] as string[],
    newPreflighted: [] as string[],
    cancelledNew: 0,
    preflightError: undefined as Error | undefined,
    getTarget() {
      return { ...this.current };
    },
    updateSession(path: string | undefined, cwd: string) {
      this.current = { ...this.current, cwd, ...(path ? { sessionFile: path } : {}) };
    },
    async preflight(summary: any) {
      this.preflighted.push(summary.path);
      if (this.preflightError) throw this.preflightError;
    },
    async preflightNewAgent(agentId: string) {
      this.newPreflighted.push(agentId);
      return {
        agentId,
        sessionId: "local/main",
        purpose: "interactive",
        cwd: join(workspace, "agents", agentId),
        sessionFile: join(workspace, "agents", agentId, "new.jsonl"),
      };
    },
    cancelPendingNewAgent() {
      this.cancelledNew += 1;
    },
    consumeSwitchResult() {
      return { kind: "switched", target: this.getTarget() };
    },
  };
  return {
    runtime: createAppRuntime(config as never),
    target,
    alphaPath,
    alphaResearchPath,
    betaPath,
  };
}

function writeLocalSession(agentId: string, name: string, prompt: string): string {
  const agentRoot = join(workspace, "agents", agentId);
  const descriptor = createSessionDescriptor({
    agentRoot,
    key: createLocalSessionKey({ agentId, name }),
    purpose: "interactive",
    delivery: { kind: "transcript" },
  });
  ensureSessionManifest(descriptor);
  if (descriptor.storage.kind !== "durable") throw new Error("expected durable session");
  mkdirSync(descriptor.storage.dir, { recursive: true });
  const path = join(descriptor.storage.dir, `${agentId}-${name}.jsonl`);
  const timestamp = new Date().toISOString();
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id: `${agentId}-${name}`,
      timestamp,
      cwd: agentRoot,
    })}\n${JSON.stringify({
      type: "message",
      id: "user",
      parentId: null,
      timestamp,
      message: { role: "user", content: prompt, timestamp: Date.now() },
    })}\n`,
    "utf-8",
  );
  return path;
}
