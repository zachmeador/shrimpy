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

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-chat-command-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

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

    const code = await cmdChat(
      ["--model-policy", "coding"],
      { workspace } as any,
      {
        cwd: workspace,
        shouldRunSetup: async () => false,
        bootstrapCompletion: async () => undefined,
        loadConfig: (path) => {
          loadedWorkspace = path;
          return { workspace: path } as any;
        },
        launchChatSession: async (_runtime, request) => {
          captured = request;
        },
      },
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

  test("opens an explicit agent without running blank-chat setup bootstrap", async () => {
    let setupChecked = false;
    let captured: ChatSessionRequest | undefined;

    const code = await cmdChat(
      ["career", "--skill", "research", "--skill", "draft"],
      { workspace } as any,
      {
        cwd: workspace,
        shouldRunSetup: async () => {
          setupChecked = true;
          return true;
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
    );

    assert.equal(code, 0);
    assert.equal(setupChecked, false);
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
});
