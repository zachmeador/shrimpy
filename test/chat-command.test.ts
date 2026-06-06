import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cmdChat,
  createChatSessionRequest,
  type ChatSessionRequest,
} from "../dist/commands/chat.js";
import { resolveCommandResult } from "../dist/commands/framework.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-chat-command-test-"));
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

describe("cmdChat", () => {
  test("builds a default-agent TUI chat request", () => {
    assert.deepEqual(
      createChatSessionRequest(
        [
          "--provider",
          "openai",
          "--model",
          "gpt-5",
          "--model-policy",
          "coding",
          "--thinking",
          "high",
          "--skill",
          "memory",
          "--skill",
          "journal",
        ],
        "usage",
        workspace,
      ),
      {
        agentId: undefined,
        channel: "tui",
        sessionType: "tui",
        provider: "openai",
        model: "gpt-5",
        modelPolicy: "coding",
        thinking: "high",
        skills: ["memory", "journal"],
        cwd: workspace,
      },
    );
  });

  test("treats the only positional as an agent id", () => {
    assert.deepEqual(
      createChatSessionRequest(
        ["career", "--model-policy", "fast"],
        "usage",
        workspace,
      ),
      {
        agentId: "career",
        channel: "tui",
        sessionType: "tui",
        provider: undefined,
        model: undefined,
        modelPolicy: "fast",
        thinking: undefined,
        skills: undefined,
        cwd: workspace,
      },
    );
  });

  test("rejects prompt-like extra positionals", () => {
    assert.throws(
      () => createChatSessionRequest(["career", "hello"], "usage", workspace),
      /chat accepts at most one agent id/,
    );
  });

  test("rejects invalid thinking levels", () => {
    assert.throws(
      () => createChatSessionRequest(["--thinking", "banana"], "usage", workspace),
      /thinking level must be one of:/,
    );
  });

  test("opens the default agent through the normal runtime path", async () => {
    let loadedWorkspace: string | undefined;
    let captured: ChatSessionRequest | undefined;

    const code = await resolveCommandResult(
      await cmdChat(
        ["--model-policy", "coding"],
        { workspace } as any,
        {
          cwd: workspace,
          resolveSetupState: async () => ({ kind: "ready", models: [] }),
          bootstrapCompletion: async () => undefined,
          loadConfig: (path) => {
            loadedWorkspace = path;
            return { workspace: path } as any;
          },
          launchChatSession: async (_runtime, request) => {
            captured = request;
          },
        },
      ),
      { workspace } as any,
    );

    assert.equal(code, 0);
    assert.equal(loadedWorkspace, workspace);
    assert.deepEqual(captured, {
      agentId: undefined,
      channel: "tui",
      sessionType: "tui",
      provider: undefined,
      model: undefined,
      modelPolicy: "coding",
      thinking: undefined,
      skills: undefined,
      cwd: workspace,
    });
  });

  test("opens an explicit agent through the shared TUI setup gate", async () => {
    let setupStateResolved = false;
    let captured: ChatSessionRequest | undefined;

    const code = await resolveCommandResult(
      await cmdChat(
        ["career", "--skill", "research", "--skill", "draft"],
        { workspace } as any,
        {
          cwd: workspace,
          resolveSetupState: async () => {
            setupStateResolved = true;
            return { kind: "ready", models: [] };
          },
          bootstrapCompletion: async () => undefined,
          loadConfig: (path) => ({
            workspace: path,
            agents: [{ id: "career", root: "agents/career" }],
          }) as any,
          launchChatSession: async (_runtime, request) => {
            captured = request;
          },
        },
      ),
      { workspace } as any,
    );

    assert.equal(code, 0);
    assert.equal(setupStateResolved, true);
    assert.deepEqual(captured, {
      agentId: "career",
      channel: "tui",
      sessionType: "tui",
      provider: undefined,
      model: undefined,
      modelPolicy: undefined,
      thinking: undefined,
      skills: ["research", "draft"],
      cwd: workspace,
    });
  });

  test("blocks explicit-agent chat when setup is not ready", async () => {
    let launched = false;
    let setupStateResolved = false;

    const { result, errors } = await captureErrors(async () =>
      resolveCommandResult(
        await cmdChat(
          ["career"],
          { workspace } as any,
          {
            cwd: workspace,
            resolveSetupState: async () => {
              setupStateResolved = true;
              return { kind: "needs_coding_policy", models: [] };
            },
            launchChatSession: async () => {
              launched = true;
            },
          },
        ),
        { workspace } as any,
      )
    );

    assert.equal(result, 1);
    assert.equal(setupStateResolved, true);
    assert.equal(launched, false);
    assert.match(errors.join("\n"), /Run: shrimpy setup/);
  });
});
