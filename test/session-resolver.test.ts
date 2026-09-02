import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Api, Model } from "@earendil-works/pi-ai";
import { createChannelSessionKey, createLocalSessionKey } from "../dist/sessions/identity.js";
import { SessionResolver } from "../dist/sessions/resolver.js";

describe("session resolution", () => {
  test("restores durable session models only when no override is provided", async () => {
    const model = createModel("Selected Model");
    const runtime = createRuntime();
    const bootstrap = createBootstrap(() => model);
    const resolver = new SessionResolver({
      runtime,
      bootstrap,
      channelBus: {} as any,
      agentId: "shrimpy",
    });

    const restored = await resolver.resolve({
      key: createLocalSessionKey({ agentId: "shrimpy", name: "main" }),
      purpose: "interactive",
      delivery: { kind: "transcript" },
      cwd: "/tmp/cwd",
    });
    const explicit = await resolver.resolve({
      key: createLocalSessionKey({ agentId: "shrimpy", name: "main" }),
      purpose: "interactive",
      delivery: { kind: "transcript" },
      cwd: "/tmp/cwd",
      model: "qwen",
    });

    assert.equal(restored.restoreModelFromSession, true);
    assert.equal(restored.modelResolution?.source, "policy");
    assert.equal(restored.descriptor.key.namespace, "local");
    assert.deepEqual(restored.descriptor.delivery, { kind: "transcript" });
    assert.equal(explicit.restoreModelFromSession, false);
    assert.equal(explicit.modelResolution?.source, "cli");
  });

  test("resolves channel sessions through the same path", async () => {
    const initial = createModel("Initial Model");
    const changed = createModel("Changed Model");
    let current = initial;
    const resolver = new SessionResolver({
      runtime: createRuntime(),
      bootstrap: createBootstrap(() => current),
      channelBus: {} as any,
      agentId: "shrimpy",
    });
    current = changed;

    const plan = await resolver.resolve({
      key: createChannelSessionKey({
        agentId: "shrimpy",
        channel: "telegram~shrimpy~1",
      }),
      purpose: "channel",
      delivery: { kind: "channel", channel: "telegram~shrimpy~1" },
      cwd: "/tmp/shrimpy-cwd",
    });

    assert.equal(plan.model?.name, "Changed Model");
    assert.equal(plan.modelResolution?.model?.name, "Changed Model");
    assert.equal(plan.descriptor.key.namespace, "channel");
    assert.deepEqual(plan.descriptor.delivery, {
      kind: "channel",
      channel: "telegram~shrimpy~1",
    });
    assert.equal(plan.descriptor.cwd, "/tmp/shrimpy-cwd");
    assert.equal(plan.prompt?.extraResources, undefined);
    assert.equal(plan.prompt?.appendSystemPrompt, undefined);
  });
});

function createRuntime() {
  return {
    getAgent(agentId = "shrimpy") {
      return {
        id: agentId,
        modelPolicy: "coding",
        thinking: "high",
      };
    },
    getAgentPaths() {
      return {
        root: "/tmp/shrimpy-agent",
      };
    },
    getAgentCwd() {
      return "/tmp/shrimpy-cwd";
    },
    resolveAgentToolPolicy() {
      return {
        daemonToolNames: [],
        disabledToolNames: [],
        activeToolNames: [],
        registeredToolNames: [],
        capabilities: [],
      };
    },
    async buildRuntimeTools() {
      return [];
    },
  } as any;
}

function createBootstrap(currentModel: () => Model<Api>) {
  return {
    agentId: "shrimpy",
    agentRootPath: "/tmp/shrimpy-agent",
    workspacePath: "/tmp/shrimpy-workspace",
    modelsPath: "/tmp/shrimpy-models.json",
    modelPolicies: {
      coding: {
        candidates: [{ provider: "local", id: "qwen" }],
      },
    },
    modelRuntime: {
      getModel(provider: string, id: string) {
        const model = currentModel();
        return provider === model.provider && id === model.id ? model : undefined;
      },
      getAvailableSnapshot() {
        return [currentModel()];
      },
      hasConfiguredAuth() {
        return true;
      },
    },
  } as any;
}

function createModel(name: string): Model<Api> {
  return {
    id: "qwen",
    name,
    provider: "local",
    api: "openai-completions",
    baseUrl: "https://example.invalid",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}
