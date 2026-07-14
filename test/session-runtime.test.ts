import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { AgentSessionRuntime } from "@earendil-works/pi-coding-agent";
import { createAppRuntime } from "../dist/app/runtime.js";
import { ensureWorkspaceInitialized } from "../dist/setup/init.js";
import { prepareForegroundSessionOpen } from "../dist/sessions/foreground.js";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import { openSessionRuntime } from "../dist/sessions/open.js";
import { readSessionOwner } from "../dist/sessions/ownership.js";
import {
  makeTempWorkspace,
  removeTempWorkspace,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-session-runtime-test-");
  ensureWorkspaceInitialized(workspace);
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

test("durable runtime releases its lease when /new replaces the session", async () => {
  const app = createAppRuntime({ workspace });
  const prepared = await prepareForegroundSessionOpen({
    runtime: app,
    agentId: "shrimpy",
    session: { namespace: "local", name: "main" },
    purpose: "interactive",
    persistent: true,
    allowMissingModel: true,
  });
  let runtime: AgentSessionRuntime | undefined = await openSessionRuntime(
    prepared.bootstrap,
    prepared.plan,
  );
  const key = createLocalSessionKey({ agentId: "shrimpy", name: "main" });

  try {
    const previousSessionFile = runtime.session.sessionFile;
    const previousOwner = readSessionOwner(workspace, key);
    assert.ok(previousSessionFile);
    assert.ok(previousOwner);
    let invalidations = 0;

    // Pi's InteractiveMode owns this callback and replaces any host callback.
    runtime.setBeforeSessionInvalidate(() => {
      invalidations += 1;
    });

    const result = await runtime.newSession();

    assert.equal(result.cancelled, false);
    assert.equal(invalidations, 1);
    assert.notEqual(runtime.session.sessionFile, previousSessionFile);
    const currentOwner = readSessionOwner(workspace, key);
    assert.ok(currentOwner);
    assert.notEqual(currentOwner.token, previousOwner.token);

    await runtime.dispose();
    runtime = undefined;
    assert.equal(readSessionOwner(workspace, key), undefined);
  } finally {
    await runtime?.dispose();
  }
});
