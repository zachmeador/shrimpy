import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppRuntime } from "../dist/app/index.js";
import {
  cmdMechanic,
  createMechanicSessionRequest,
  type MechanicSessionRequest,
} from "../dist/commands/mechanic.js";
import { resolveCommandResult } from "../dist/commands/framework.js";
import { setupInit } from "../dist/setup/init.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-mechanic-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

async function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; errors: string[] }> {
  const originalError = console.error;
  const errors: string[] = [];
  console.error = (...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(" "));
  };

  try {
    const result = await fn();
    return { result, errors };
  } finally {
    console.error = originalError;
  }
}

describe("cmdMechanic", () => {
  test("builds a direct mechanic TUI session request", () => {
    assert.deepEqual(
      createMechanicSessionRequest(
        [
          "repair",
          "setup",
          "--provider",
          "openai",
          "--model",
          "gpt-5",
          "--model-policy",
          "coding",
          "--thinking",
          "high",
          "--skill",
          "mechanic",
        ],
        "usage",
        workspace,
      ),
      {
        agentId: "mechanic",
        channel: "tui",
        sessionType: "tui",
        provider: "openai",
        model: "gpt-5",
        modelPolicy: "coding",
        thinking: "high",
        skills: ["mechanic"],
        initialMessage: "repair setup",
        cwd: workspace,
      },
    );
  });

  test("loads the mechanic skill by default and preserves extra requested skills", () => {
    assert.deepEqual(
      createMechanicSessionRequest(
        ["inspect", "channels", "--skill", "setup", "--skill", "mechanic"],
        "usage",
        workspace,
      ),
      {
        agentId: "mechanic",
        channel: "tui",
        sessionType: "tui",
        provider: undefined,
        model: undefined,
        modelPolicy: undefined,
        thinking: undefined,
        skills: ["mechanic", "setup"],
        initialMessage: "inspect channels",
        cwd: workspace,
      },
    );
  });

  test("opens the mechanic agent through the normal runtime path", async () => {
    await setupInit(workspace);
    const config = readConfig();
    let captured: MechanicSessionRequest | undefined;

    const code = await resolveCommandResult(
      await cmdMechanic(
        ["check", "models", "--model-policy", "coding"],
        config,
        {
          cwd: workspace,
          resolveSetupState: async () => ({ kind: "ready", models: [] }),
          launchMechanicSession: async (_runtime, request) => {
            captured = request;
          },
        },
      ),
      config,
    );

    assert.equal(code, 0);
    assert.deepEqual(captured, {
      agentId: "mechanic",
      channel: "tui",
      sessionType: "tui",
      provider: undefined,
      model: undefined,
      modelPolicy: "coding",
      thinking: undefined,
      skills: ["mechanic"],
      initialMessage: "check models",
      cwd: workspace,
    });
  });

  test("reports a clear error when mechanic is missing", async () => {
    const runtime = createAppRuntime({
      workspace,
      agents: [{ id: "shrimpy", root: "agents/shrimpy" }],
    } as any);

    const { result, errors } = await captureErrors(async () =>
      resolveCommandResult(
        await cmdMechanic([], { workspace } as any, {
          resolveSetupState: async () => ({ kind: "ready", models: [] }),
          createRuntime: () => runtime,
          launchMechanicSession: async () => {
            throw new Error("should not launch");
          },
        }),
        { workspace } as any,
      )
    );

    assert.equal(result, 1);
    assert.match(errors.join("\n"), /mechanic agent not found/);
    assert.match(errors.join("\n"), /shrimpy setup init/);
  });
});

function readConfig(): any {
  return {
    ...JSON.parse(
      readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
    ),
    workspace,
  };
}
