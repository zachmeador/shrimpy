import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentChannelRuntime } from "../dist/agents/channel-runtime.js";
import { resolveAgentAttention } from "../dist/config/agents.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-agent-channel-runtime-test-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("AgentChannelRuntime", () => {
  test("does not infer skill resources from channel names", () => {
    const agentRoot = join(workspace, "agents", "shrimpy");

    const runtime = {
      resolved: {
        adapterRouting: { routes: [] },
        model: { provider: "local", id: "qwen" },
      },
      getAgent(agentId: string) {
        return {
          id: agentId,
          thinking: "high",
          tools: [],
          attention: resolveAgentAttention(),
        };
      },
      getAgentPaths() {
        return {
          root: agentRoot,
        };
      },
      buildRuntimeTools() {
        return [];
      },
      resolveAgentToolPolicy() {
        return {
          daemonToolNames: [],
          disabledToolNames: [],
          activeToolNames: ["read", "bash", "edit", "write"],
          registeredToolNames: ["read", "bash", "edit", "write", "grep", "find", "ls"],
          capabilities: [],
        };
      },
    } as any;

    const agentRuntime = new AgentChannelRuntime({
      runtime,
      bootstrap: {
        agentRootPath: agentRoot,
        modelRegistry: {
          find(provider: string, id: string) {
            return provider === "local" && id === "qwen"
              ? { provider: "local", id: "qwen", contextWindow: 1000 }
              : undefined;
          },
        },
      } as any,
      channelBus: {} as any,
      agentId: "shrimpy",
    }) as any;

    const plan = agentRuntime.registry.planForChannel("skill~jobs~weather-check");
    assert.equal(plan.descriptor.kind, "gateway");
    assert.deepEqual(plan.model, { provider: "local", id: "qwen", contextWindow: 1000 });
    assert.equal(plan.defaultThinking, "high");
    assert.equal(plan.prompt?.extraResources, undefined);
    assert.equal(plan.prompt?.appendSystemPrompt, undefined);
  });
});
