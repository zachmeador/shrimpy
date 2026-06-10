import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Api, Model } from "@earendil-works/pi-ai";
import { SessionPlanner } from "../dist/sessions/index.js";

describe("SessionPlanner", () => {
  test("plans direct model restore only when no model override is provided", async () => {
    const model = createModel("Selected Model");
    const runtime = createRuntime();
    const bootstrap = createBootstrap(() => model);
    const planner = new SessionPlanner({
      runtime,
      bootstrap,
      channelBus: {} as any,
      agentId: "shrimpy",
    });

    const restored = await planner.planDirect({
      label: "tui",
      channel: "tui",
      sessionType: "tui",
      cwd: "/tmp/cwd",
    });
    const explicit = await planner.planDirect({
      label: "tui",
      channel: "tui",
      sessionType: "tui",
      cwd: "/tmp/cwd",
      model: "qwen",
    });

    assert.equal(restored.restoreModelFromSession, true);
    assert.equal(restored.modelResolution?.source, "policy");
    assert.equal(restored.defaultThinking, "high");
    assert.equal(restored.descriptor.kind, "tui");
    assert.equal(restored.descriptor.channel, "tui");
    assert.equal(explicit.restoreModelFromSession, false);
    assert.equal(explicit.modelResolution?.source, "cli");
  });

  test("keeps gateway model resolution fixed at planner construction", async () => {
    const initial = createModel("Initial Model");
    const changed = createModel("Changed Model");
    let current = initial;
    const planner = new SessionPlanner({
      runtime: createRuntime(),
      bootstrap: createBootstrap(() => current),
      channelBus: {} as any,
      agentId: "shrimpy",
    });
    current = changed;

    const plan = await planner.planChannel("telegram~shrimpy~1");

    assert.equal(plan.model?.name, "Initial Model");
    assert.equal(plan.modelResolution?.model?.name, "Initial Model");
    assert.equal(plan.descriptor.kind, "gateway");
    assert.equal(plan.descriptor.channel, "telegram~shrimpy~1");
    assert.equal(plan.defaultThinking, "high");
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
    config: {
      modelPolicies: {
        coding: {
          candidates: [{ provider: "local", id: "qwen" }],
        },
      },
    },
    modelRegistry: {
      find(provider: string, id: string) {
        const model = currentModel();
        return provider === model.provider && id === model.id ? model : undefined;
      },
      getAvailable() {
        return [currentModel()];
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
