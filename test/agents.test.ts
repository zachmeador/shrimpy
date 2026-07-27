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
    assert.equal(agents[0].cwd, "agents/shrimpy");
  });

  test("deduplicates tools and keeps thinking defaults", () => {
    const agents = resolveAgentsConfig([
      {
        id: "primary",
        modelPolicy: "coding",
        tools: ["send_message", "send_message", "read_channel"],
        disabledTools: ["bash", "bash"],
        thinking: "high",
      },
    ]);

    assert.equal(agents.length, 1);
    assert.equal(agents[0].root, "agents/primary");
    assert.equal(agents[0].cwd, "agents/primary");
    assert.equal(agents[0].modelPolicy, "coding");
    assert.deepEqual(agents[0].tools, ["send_message", "read_channel"]);
    assert.deepEqual(agents[0].disabledTools, ["bash"]);
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
    assert.equal(agents[0].cwd, "agents/career-custom");
  });

  test("keeps explicit agent cwd separate from root", () => {
    const agents = resolveAgentsConfig([
      {
        id: "mechanic",
        root: "agents/mechanic",
        cwd: ".",
      },
      {
        id: "external",
        root: "agents/external",
        cwd: "/mnt/agents/external",
      },
    ]);

    assert.equal(agents[0].cwd, ".");
    assert.equal(agents[1].cwd, "/mnt/agents/external");
  });

  test("defaults knowledge to the agent and keeps mechanic global", () => {
    const agents = resolveAgentsConfig([
      { id: "shrimpy" },
      { id: "researcher", knowledgeScope: "global" },
      { id: "mechanic" },
    ]);

    assert.equal(agents[0].knowledgeScope, "agent");
    assert.equal(agents[1].knowledgeScope, "global");
    assert.equal(agents[1].configuredKnowledgeScope, "global");
    assert.equal(agents[2].knowledgeScope, "global");
    assert.equal(agents[2].configuredKnowledgeScope, undefined);
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

  test("rejects narrowing mechanic knowledge scope", () => {
    assert.throws(
      () =>
        validateAgentsConfig([
          { id: "shrimpy" },
          { id: "mechanic", knowledgeScope: "agent" },
        ]),
      /mechanic.*knowledgeScope must be "global"/,
    );
  });
});
