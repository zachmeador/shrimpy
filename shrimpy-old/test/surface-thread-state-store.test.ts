import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SurfaceThreadStateStore } from "../dist/surfaces/shared/thread-state-store.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-surface-state-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("SurfaceThreadStateStore", () => {
  test("stores and lists addressed-agent state per surface thread", () => {
    const store = new SurfaceThreadStateStore(join(workspace, "surface-state.json"));

    store.setAddressedAgent("telegram", "4242", "career");
    store.setAddressedAgent("discord", "abc", "music");

    assert.deepEqual(store.get("telegram", "4242"), {
      addressedAgentId: "career",
    });
    assert.deepEqual(store.list(), [
      { surface: "discord", threadId: "abc", addressedAgentId: "music" },
      { surface: "telegram", threadId: "4242", addressedAgentId: "career" },
    ]);
  });

  test("clears addressed-agent state and drops empty entries", () => {
    const store = new SurfaceThreadStateStore(join(workspace, "surface-state.json"));

    store.setAddressedAgent("telegram", "4242", "career");
    store.clearAddressedAgent("telegram", "4242");

    assert.deepEqual(store.get("telegram", "4242"), {});
    assert.deepEqual(store.list(), []);
  });

  test("clears addressed-agent state for an agent across all surfaces", () => {
    const store = new SurfaceThreadStateStore(join(workspace, "surface-state.json"));

    store.setAddressedAgent("telegram", "4242", "career");
    store.setAddressedAgent("discord", "thread-1", "career");
    store.setAddressedAgent("telegram", "9999", "music");

    assert.deepEqual(store.clearAddressedAgentEverywhere("career"), [
      { surface: "discord", threadId: "thread-1", addressedAgentId: "career" },
      { surface: "telegram", threadId: "4242", addressedAgentId: "career" },
    ]);
    assert.deepEqual(store.list(), [
      { surface: "telegram", threadId: "9999", addressedAgentId: "music" },
    ]);
  });

  test("renames addressed-agent state across all surfaces", () => {
    const store = new SurfaceThreadStateStore(join(workspace, "surface-state.json"));

    store.setAddressedAgent("telegram", "4242", "career");
    store.setAddressedAgent("discord", "thread-1", "career");
    store.setAddressedAgent("telegram", "9999", "music");

    assert.deepEqual(store.renameAddressedAgentEverywhere("career", "jobs"), [
      { surface: "discord", threadId: "thread-1", addressedAgentId: "jobs" },
      { surface: "telegram", threadId: "4242", addressedAgentId: "jobs" },
    ]);
    assert.deepEqual(store.list(), [
      { surface: "discord", threadId: "thread-1", addressedAgentId: "jobs" },
      { surface: "telegram", threadId: "4242", addressedAgentId: "jobs" },
      { surface: "telegram", threadId: "9999", addressedAgentId: "music" },
    ]);
  });
});
