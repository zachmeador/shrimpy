import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  resolveAgentsConfig,
  validateAgentsConfig,
} from "../dist/config/agents.js";

describe("resolveAgentsConfig", () => {
  test("returns a default agent when config does not specify agents", () => {
    const agents = resolveAgentsConfig(undefined);
    assert.equal(agents.length, 1);
    assert.equal(agents[0].id, "shrimpy");
    assert.equal(agents[0].root, "agents/shrimpy");
  });

  test("deduplicates tools and keeps thinking defaults", () => {
    const agents = resolveAgentsConfig([
      {
        id: "primary",
        model: {
          provider: "local",
          id: "qwen.gguf",
        },
        tools: ["send_message", "send_message", "read_channel"],
        thinking: "high",
      },
    ]);

    assert.equal(agents.length, 1);
    assert.equal(agents[0].root, "agents/primary");
    assert.deepEqual(agents[0].model, {
      provider: "local",
      id: "qwen.gguf",
    });
    assert.deepEqual(agents[0].tools, ["send_message", "read_channel"]);
    assert.equal(agents[0].thinking, "high");
  });

  test("keeps explicit roots", () => {
    const agents = resolveAgentsConfig([
      {
        id: "career",
        root: "agents/career-custom",
      },
    ]);

    assert.equal(agents.length, 1);
    assert.equal(agents[0].root, "agents/career-custom");
  });
});

describe("validateAgentsConfig", () => {
  test("rejects an empty agents array", () => {
    assert.throws(
      () => validateAgentsConfig([]),
      /at least one entry/,
    );
  });

  test("rejects duplicate agent ids", () => {
    assert.throws(
      () =>
        validateAgentsConfig([
          { id: "same" },
          { id: "same" },
        ]),
      /duplicate id/,
    );
  });

  test("rejects routing fields in agent definitions", () => {
    assert.throws(
      () => validateAgentsConfig([{ id: "career", channels: ["home"] }]),
      /agents\[0\]/,
    );
    assert.throws(
      () => validateAgentsConfig([{ id: "career", triggers: ["job"] }]),
      /agents\[0\]/,
    );
  });

  test("rejects removed daemon tools", () => {
    assert.throws(
      () => validateAgentsConfig([{ id: "shrimpy", tools: ["memory"] }]),
      /unknown daemon tool "memory"/,
    );
  });
});
