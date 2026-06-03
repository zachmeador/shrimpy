import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { resolveSessionCompactionPolicy } from "../dist/sessions/compaction-policy.js";

describe("resolveRuntimeConfig", () => {
  test("returns defaults when runtime config is omitted", () => {
    const resolved = resolveRuntimeConfig();
    assert.deepEqual(resolved, {
      theme: "shrimpy",
      quietStartup: true,
      noSkills: false,
      noPromptTemplates: true,
      compaction: {
        enabled: true,
        reserveTokens: 32768,
        keepRecentTokens: 30000,
      },
    });
  });

  test("merges partial overrides", () => {
    const resolved = resolveRuntimeConfig({
      quietStartup: false,
      noSkills: true,
      compaction: { keepRecentTokens: 16000 },
    });
    assert.deepEqual(resolved, {
      theme: "shrimpy",
      quietStartup: false,
      noSkills: true,
      noPromptTemplates: true,
      compaction: {
        enabled: true,
        reserveTokens: 32768,
        keepRecentTokens: 16000,
      },
    });
  });

  test("rejects invalid values", () => {
    assert.throws(
      () => resolveRuntimeConfig({ quietStartup: "nope" } as any),
      /Expected boolean/,
    );
    assert.throws(
      () => resolveRuntimeConfig({ unknown: true } as any),
      /Unexpected property/,
    );
  });

  test("uses base compaction policy when no channel override is configured", () => {
    const policy = resolveSessionCompactionPolicy({
      runtimeConfig: resolveRuntimeConfig(),
      descriptor: {
        kind: "gateway",
        channel: "maintenance",
        sessionDir: "/tmp/shrimpy/sessions/maintenance",
      },
      model: { contextWindow: 262144 } as any,
    });

    assert.equal(policy.thresholdTokens, undefined);
    assert.equal(policy.reserveTokens, 32768);
    assert.equal(policy.keepRecentTokens, 30000);
    assert.deepEqual(policy.matched, ["runtime.compaction"]);
  });

  test("lets exact session labels override channel compaction policy", () => {
    const policy = resolveSessionCompactionPolicy({
      runtimeConfig: resolveRuntimeConfig({
        compaction: {
          channels: {
            maintenance: { thresholdTokens: 100000, keepRecentTokens: 30000 },
          },
          sessions: {
            maintenance: { thresholdTokens: 80000, keepRecentTokens: 12000 },
          },
        },
      }),
      descriptor: {
        kind: "gateway",
        channel: "maintenance",
        sessionDir: "/tmp/shrimpy/sessions/maintenance",
      },
      model: { contextWindow: 262144 } as any,
    });

    assert.equal(policy.thresholdTokens, 80000);
    assert.equal(policy.reserveTokens, 182144);
    assert.equal(policy.keepRecentTokens, 12000);
    assert.deepEqual(policy.matched, [
      "runtime.compaction",
      "runtime.compaction.channels.maintenance",
      "runtime.compaction.sessions.maintenance",
    ]);
  });

  test("applies agent compaction overrides before channel overrides", () => {
    const policy = resolveSessionCompactionPolicy({
      runtimeConfig: resolveRuntimeConfig({
        compaction: {
          agents: {
            ops: { thresholdTokens: 70000, keepRecentTokens: 10000 },
          },
          channels: {
            "ops-*": { keepRecentTokens: 20000 },
          },
        },
      }),
      descriptor: {
        kind: "gateway",
        agentId: "ops",
        channel: "ops-alerts",
        sessionDir: "/tmp/shrimpy/sessions/ops-alerts",
      },
      model: { contextWindow: 262144 } as any,
    });

    assert.equal(policy.thresholdTokens, 70000);
    assert.equal(policy.reserveTokens, 192144);
    assert.equal(policy.keepRecentTokens, 20000);
    assert.deepEqual(policy.matched, [
      "runtime.compaction",
      "runtime.compaction.agents.ops",
      "runtime.compaction.channels.ops-*",
    ]);
  });
});
