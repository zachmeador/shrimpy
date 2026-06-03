import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  resolveContextConfig,
  SHRIMPY_IMMUTABLE_SYSTEM_INSTRUCTIONS,
} from "../dist/context/index.js";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { createBootstrap } from "../dist/sessions/index.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-session-bootstrap-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("createBootstrap", () => {
  test("always includes immutable Shrimpy system instructions", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });

    const bootstrap = await createBootstrap({
      config: { workspace },
      agentId: "shrimpy",
      agentRootPath: agentRoot,
      workspacePath: workspace,
      contextConfig: resolveContextConfig({
        sources: [],
        env: [],
      }),
      runtimeConfig: resolveRuntimeConfig(),
    });

    assert.match(
      bootstrap.baseSystemPrompt,
      /^\[context builtin:immutable_system_instructions identity\]\n\n# Shrimpy Framework/,
    );
    assert.match(bootstrap.baseSystemPrompt, /You are shrimpy\./);
    assert.ok(
      bootstrap.baseSystemPrompt.includes(
        SHRIMPY_IMMUTABLE_SYSTEM_INSTRUCTIONS,
      ),
    );
    assert.deepEqual(bootstrap.baseSystemSections.map((section) => section.id), [
      "builtin:immutable_system_instructions",
      "base:fallback",
    ]);
  });

  test("uses Shrimpy-owned system prompt assembly instead of Pi prompt discovery", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "profile"), { recursive: true });
    mkdirSync(join(agentRoot, ".pi"), { recursive: true });

    const soul = "# SOUL\n\nShrimpy soul.\n";
    const system = "# SYSTEM\n\nShared framework and tools guidance.\n";
    const identity = "# IDENTITY\n\nShrimpy identity.\n";

    writeFileSync(join(agentRoot, "SOUL.md"), soul, "utf-8");
    writeFileSync(join(workspace, "profile", "SYSTEM.md"), system, "utf-8");
    mkdirSync(join(agentRoot, "context"), { recursive: true });
    writeFileSync(join(agentRoot, "context", "identity.md"), identity, "utf-8");

    writeFileSync(join(agentRoot, "AGENTS.md"), "agent-root instructions\n", "utf-8");
    writeFileSync(join(workspace, "AGENTS.md"), "workspace instructions\n", "utf-8");
    writeFileSync(
      join(agentRoot, ".pi", "SYSTEM.md"),
      "pi system override\n",
      "utf-8",
    );
    writeFileSync(
      join(agentRoot, ".pi", "APPEND_SYSTEM.md"),
      "pi append override\n",
      "utf-8",
    );

    const contextConfig = resolveContextConfig({
      sources: [
        "workspace:profile/SYSTEM.md",
        "agent:SOUL.md",
        "agent:context/",
      ],
      env: [],
    });

    const bootstrap = await createBootstrap({
      config: { workspace },
      agentId: "shrimpy",
      agentRootPath: agentRoot,
      workspacePath: workspace,
      contextConfig,
      runtimeConfig: resolveRuntimeConfig(),
    });

    const expectedPrompt = [
      `[context builtin:immutable_system_instructions identity]\n\n${SHRIMPY_IMMUTABLE_SYSTEM_INSTRUCTIONS}`,
      `[context base:profile/SYSTEM.md identity]\n\n${system.trimEnd()}`,
      `[context base:SOUL.md identity]\n\n${soul.trimEnd()}`,
      `[context base:context/identity.md memory]\n\n${identity.trimEnd()}`,
    ].join("\n\n---\n\n");

    assert.equal(bootstrap.baseSystemPrompt, expectedPrompt);
    assert.equal(bootstrap.resourceLoader.getSystemPrompt(), expectedPrompt);
    assert.deepEqual(bootstrap.resourceLoader.getAgentsFiles().agentsFiles, []);
    assert.deepEqual(bootstrap.resourceLoader.getAppendSystemPrompt(), []);
    assert.equal(bootstrap.baseSystemPrompt.includes("pi system override"), false);
    assert.equal(bootstrap.baseSystemPrompt.includes("pi append override"), false);
    assert.equal(bootstrap.baseSystemPrompt.includes("workspace instructions"), false);
  });
});
