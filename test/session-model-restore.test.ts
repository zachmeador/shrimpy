import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { resolveContextConfig } from "../dist/context/index.js";
import {
  createBootstrap,
  createLocalSessionKey,
  openSession,
} from "../dist/sessions/index.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-session-model-restore-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("session model restore", () => {
  test("resumes a TUI session with the model selected inside the session", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
        selected_provider: modelProvider(["selected-model"]),
      },
    });
    const bootstrap = await testBootstrap(agentRoot);
    const descriptor = localDescriptor(agentRoot);
    const configuredModel = bootstrap.modelRegistry.find(
      "configured_provider",
      "configured-model",
    );
    const selectedModel = bootstrap.modelRegistry.find(
      "selected_provider",
      "selected-model",
    );
    assert.ok(configuredModel);
    assert.ok(selectedModel);

    const first = await openSession(bootstrap, {
      descriptor,
      model: configuredModel,
      restoreModelFromSession: true,
    });
    appendAssistantMessage(first.sessionManager, configuredModel);
    await first.setModel(selectedModel);
    first.dispose();

    const resumed = await openSession(bootstrap, {
      descriptor,
      model: configuredModel,
      restoreModelFromSession: true,
    });

    try {
      assert.equal(resumed.model?.provider, "selected_provider");
      assert.equal(resumed.model?.id, "selected-model");

      const sessionFile = resumed.sessionFile;
      assert.ok(sessionFile);
      const metadata = latestShrimpySessionMetadata(sessionFile);
      assert.equal(metadata.env.provider, "selected_provider");
      assert.equal(metadata.env.model_id, "selected-model");
    } finally {
      resumed.dispose();
    }
  });

  test("records model switches as visible model-facing session messages", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
        selected_provider: modelProvider(["selected-model"]),
      },
    });
    const bootstrap = await testBootstrap(agentRoot);
    const descriptor = localDescriptor(agentRoot);
    const configuredModel = bootstrap.modelRegistry.find(
      "configured_provider",
      "configured-model",
    );
    const selectedModel = bootstrap.modelRegistry.find(
      "selected_provider",
      "selected-model",
    );
    assert.ok(configuredModel);
    assert.ok(selectedModel);

    const session = await openSession(bootstrap, {
      descriptor,
      model: configuredModel,
      restoreModelFromSession: true,
    });

    try {
      await session.setModel(selectedModel);

      const inMemoryMessage = session.messages.find((message: any) =>
        message.role === "custom" &&
        message.customType === "shrimpy_model_switch"
      ) as any;
      assert.ok(inMemoryMessage);
      assert.equal(inMemoryMessage.display, true);
      assert.match(
        inMemoryMessage.content,
        /Model switched: configured_provider\/configured-model -> selected_provider\/selected-model/,
      );
      appendAssistantMessage(session.sessionManager, selectedModel);

      const sessionFile = session.sessionFile;
      assert.ok(sessionFile);
      const switchMessage = latestCustomMessage(sessionFile, "shrimpy_model_switch");
      assert.equal(switchMessage.display, true);
      assert.deepEqual(switchMessage.details.previous, {
        provider: "configured_provider",
        id: "configured-model",
      });
      assert.deepEqual(switchMessage.details.current, {
        provider: "selected_provider",
        id: "selected-model",
      });
      assert.equal(switchMessage.details.source, "set");
    } finally {
      session.dispose();
    }
  });

  test("does not record switch messages when the model identity is unchanged", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
      },
    });
    const bootstrap = await testBootstrap(agentRoot);
    const descriptor = localDescriptor(agentRoot);
    const configuredModel = bootstrap.modelRegistry.find(
      "configured_provider",
      "configured-model",
    );
    assert.ok(configuredModel);

    const session = await openSession(bootstrap, {
      descriptor,
      model: configuredModel,
      restoreModelFromSession: true,
    });

    try {
      await session.setModel(configuredModel);
      appendAssistantMessage(session.sessionManager, configuredModel);

      const sessionFile = session.sessionFile;
      assert.ok(sessionFile);
      assert.equal(customMessageCount(sessionFile, "shrimpy_model_switch"), 0);
      assert.equal(
        session.messages.some((message: any) =>
          message.role === "custom" &&
          message.customType === "shrimpy_model_switch"
        ),
        false,
      );
    } finally {
      session.dispose();
    }
  });

  test("keeps an explicit startup model override ahead of session restore", async () => {
    const agentRoot = join(workspace, "agents", "shrimpy");
    mkdirSync(agentRoot, { recursive: true });
    writeModelsJson({
      providers: {
        configured_provider: modelProvider(["configured-model"]),
        selected_provider: modelProvider(["selected-model"]),
      },
    });
    const bootstrap = await testBootstrap(agentRoot);
    const descriptor = localDescriptor(agentRoot);
    const configuredModel = bootstrap.modelRegistry.find(
      "configured_provider",
      "configured-model",
    );
    const selectedModel = bootstrap.modelRegistry.find(
      "selected_provider",
      "selected-model",
    );
    assert.ok(configuredModel);
    assert.ok(selectedModel);

    const first = await openSession(bootstrap, {
      descriptor,
      model: configuredModel,
      restoreModelFromSession: true,
    });
    appendAssistantMessage(first.sessionManager, configuredModel);
    await first.setModel(selectedModel);
    first.dispose();

    const explicit = await openSession(bootstrap, {
      descriptor,
      model: configuredModel,
    });

    try {
      assert.equal(explicit.model?.provider, "configured_provider");
      assert.equal(explicit.model?.id, "configured-model");
    } finally {
      explicit.dispose();
    }
  });
});

function localDescriptor(agentRoot: string) {
  return createSessionDescriptor({
    agentRoot,
    key: createLocalSessionKey({ agentId: "shrimpy", name: "main" }),
    purpose: "interactive",
    delivery: { kind: "transcript" },
  });
}

async function testBootstrap(agentRoot: string) {
  return createBootstrap({
    config: { workspace },
    agentId: "shrimpy",
    agentRootPath: agentRoot,
    workspacePath: workspace,
    authPath: join(workspace, "state", "pi", "auth.json"),
    modelsPath: join(workspace, "state", "pi", "models.json"),
    contextConfig: resolveContextConfig({ sources: [], env: [] }),
    runtimeConfig: resolveRuntimeConfig({ noSkills: true }),
  });
}

function writeModelsJson(value: unknown): void {
  const stateDir = join(workspace, "state", "pi");
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(
    join(stateDir, "models.json"),
    JSON.stringify(value, null, 2),
    "utf-8",
  );
}

function modelProvider(modelIds: string[]): Record<string, unknown> {
  return {
    baseUrl: "http://localhost:8080/v1",
    apiKey: "local",
    api: "openai-completions",
    models: modelIds.map((id) => ({
      id,
      name: id,
      input: ["text"],
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      maxTokens: 8192,
    })),
  };
}

function latestShrimpySessionMetadata(path: string): { env: Record<string, string> } {
  const lines = readFileSync(path, "utf-8").split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index--) {
    const parsed = JSON.parse(lines[index]);
    if (
      parsed.type === "custom" &&
      parsed.customType === "shrimpy_session_metadata"
    ) {
      return parsed.data;
    }
  }
  throw new Error("missing shrimpy_session_metadata entry");
}

function latestCustomMessage(path: string, customType: string): {
  display: boolean;
  content: string;
  details: any;
} {
  const messages = readCustomMessages(path, customType);
  const latest = messages.at(-1);
  if (!latest) throw new Error(`missing ${customType} custom message`);
  return latest;
}

function customMessageCount(path: string, customType: string): number {
  return readCustomMessages(path, customType).length;
}

function readCustomMessages(path: string, customType: string): Array<{
  display: boolean;
  content: string;
  details: any;
}> {
  return readFileSync(path, "utf-8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((parsed) =>
      parsed.type === "custom_message" &&
      parsed.customType === customType
    );
}

function appendAssistantMessage(
  sessionManager: { appendMessage(message: unknown): void },
  model: { provider: string; id: string },
): void {
  sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "hello" }],
    api: "openai-completions",
    provider: model.provider,
    model: model.id,
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  });
}
