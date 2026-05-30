import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { editAttentionConfig } from "../dist/agents/attention-edit.js";

describe("editAttentionConfig", () => {
  test("sets a base field without disturbing siblings", () => {
    const next = editAttentionConfig(
      { mode: "mentions" },
      { set: { senders: ["human", "system"] } },
    );
    assert.deepEqual(next, { mode: "mentions", senders: ["human", "system"] });
  });

  test("deduplicates set values", () => {
    const next = editAttentionConfig(undefined, {
      set: { senders: ["human", "human", "agent"], actorIds: ["a", "a", "b"] },
    });
    assert.deepEqual(next, { senders: ["human", "agent"], actorIds: ["a", "b"] });
  });

  test("creates and merges a channel override, leaving the base intact", () => {
    const next = editAttentionConfig(
      { mode: "mentions" },
      { channel: "ops", set: { mode: "all", actorIds: ["telegram:42"] } },
    );
    assert.deepEqual(next, {
      mode: "mentions",
      channels: { ops: { mode: "all", actorIds: ["telegram:42"] } },
    });
  });

  test("patches an existing channel override field-by-field", () => {
    const next = editAttentionConfig(
      { mode: "mentions", channels: { ops: { mode: "all", senders: ["human"] } } },
      { channel: "ops", set: { senders: ["agent"] } },
    );
    assert.deepEqual(next, {
      mode: "mentions",
      channels: { ops: { mode: "all", senders: ["agent"] } },
    });
  });

  test("clears a single base field but keeps the rest", () => {
    const next = editAttentionConfig(
      { mode: "mentions", senders: ["human"], actorIds: ["x"] },
      { clear: ["senders"] },
    );
    assert.deepEqual(next, { mode: "mentions", actorIds: ["x"] });
  });

  test("prunes a channel override that becomes empty after clearing", () => {
    const next = editAttentionConfig(
      { mode: "mentions", channels: { ops: { senders: ["human"] } } },
      { channel: "ops", clear: ["senders"] },
    );
    assert.deepEqual(next, { mode: "mentions" });
  });

  test("keeps a channel override that still has fields after clearing", () => {
    const next = editAttentionConfig(
      { channels: { ops: { mode: "all", actorIds: ["x"] } } },
      { channel: "ops", clear: ["actorIds"] },
    );
    assert.deepEqual(next, { channels: { ops: { mode: "all" } } });
  });

  test("removes an entire channel override", () => {
    const next = editAttentionConfig(
      { mode: "mentions", channels: { ops: { mode: "all" }, alerts: { mode: "none" } } },
      { channel: "ops", removeChannel: true },
    );
    assert.deepEqual(next, { mode: "mentions", channels: { alerts: { mode: "none" } } });
  });

  test("returns null when the last field is cleared", () => {
    const next = editAttentionConfig({ mode: "mentions" }, { clear: ["mode"] });
    assert.equal(next, null);
  });

  test("returns null when the last channel override is removed", () => {
    const next = editAttentionConfig(
      { channels: { ops: { mode: "all" } } },
      { channel: "ops", removeChannel: true },
    );
    assert.equal(next, null);
  });

  test("does not mutate the input config", () => {
    const current = { mode: "mentions" as const, channels: { ops: { mode: "all" as const } } };
    const snapshot = JSON.stringify(current);
    editAttentionConfig(current, { channel: "ops", set: { senders: ["human"] } });
    assert.equal(JSON.stringify(current), snapshot);
  });
});
