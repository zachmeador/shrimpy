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
  test("uses a minimal fallback when no configured context resources are readable", async () => {
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

    assert.equal(
      bootstrap.baseSystemPrompt,
      [
        `<context path="fallback">`,
        "You are shrimpy.",
        "</context>",
      ].join("\n"),
    );
    assert.deepEqual(bootstrap.baseSystemSections.map((section) => section.id), [
      "base:fallback",
    ]);
  });

  test("uses Shrimpy-owned system prompt assembly instead of Pi prompt discovery", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    mkdirSync(join(workspace, "context"), { recursive: true });
    mkdirSync(join(agentRoot, ".pi"), { recursive: true });

    const soul = "# SOUL\n\nShrimpy soul.\n";
    const system = "# SYSTEM\n\nShared framework and tools guidance.\n";
    const userContext = "# USER\n\nOwner preferences.\n";
    const workspaceContext = "# WORKSPACE\n\nLocal environment.\n";
    const memory = "# MEMORY\n\nShrimpy memory.\n";

    writeFileSync(join(agentRoot, "SOUL.md"), soul, "utf-8");
    writeFileSync(join(workspace, "context", "SYSTEM.md"), system, "utf-8");
    writeFileSync(join(workspace, "context", "USER.md"), userContext, "utf-8");
    writeFileSync(join(workspace, "context", "WORKSPACE.md"), workspaceContext, "utf-8");
    mkdirSync(join(agentRoot, "context"), { recursive: true });
    writeFileSync(join(agentRoot, "context", "memory.md"), memory, "utf-8");

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
        "workspace:context/",
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
      `<context path="${join(workspace, "context", "SYSTEM.md")}">\n${system.trimEnd()}\n</context>`,
      `<context path="${join(workspace, "context", "USER.md")}">\n${userContext.trimEnd()}\n</context>`,
      `<context path="${join(workspace, "context", "WORKSPACE.md")}">\n${workspaceContext.trimEnd()}\n</context>`,
      `<context path="${join(agentRoot, "SOUL.md")}">\n${soul.trimEnd()}\n</context>`,
      `<context path="${join(agentRoot, "context", "memory.md")}">\n${memory.trimEnd()}\n</context>`,
    ].join("\n\n");

    assert.equal(bootstrap.baseSystemPrompt, expectedPrompt);
    assert.equal(bootstrap.resourceLoader.getSystemPrompt(), expectedPrompt);
    assert.deepEqual(bootstrap.resourceLoader.getAgentsFiles().agentsFiles, []);
    assert.deepEqual(bootstrap.resourceLoader.getAppendSystemPrompt(), []);
    assert.equal(bootstrap.baseSystemPrompt.includes("pi system override"), false);
    assert.equal(bootstrap.baseSystemPrompt.includes("pi append override"), false);
    assert.equal(bootstrap.baseSystemPrompt.includes("workspace instructions"), false);
  });
});
