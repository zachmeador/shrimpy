import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";
import { createAppRuntime } from "../dist/app/index.js";
import { createLocalSessionKey } from "../dist/sessions/identity.js";
import {
  inspectSessionContext,
} from "../dist/sessions/context-inspection.js";
import { SessionResolver } from "../dist/sessions/resolver.js";
import {
  disposeSession,
  openSession,
} from "../dist/sessions/open.js";
import { runSessionTurn } from "../dist/sessions/turn-output.js";
import {
  makeTempWorkspace,
  removeTempWorkspace,
  setupInit,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-context-parity-");
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

test("context inspection matches a live session turn", async () => {
  await setupInit(workspace);
  const config = JSON.parse(
    readFileSync(`${workspace}/config/shrimpy.json`, "utf-8"),
  );
  const runtime = createAppRuntime({ ...config, workspace });
  const bootstrap = await runtime.createBootstrap({ agentId: "shrimpy" });
  const model = createCaptureModel();
  let liveContext: Context | undefined;

  bootstrap.authStorage.setRuntimeApiKey(model.provider, "test-api-key");
  bootstrap.modelRegistry.registerProvider(model.provider, {
    api: model.api,
    baseUrl: model.baseUrl,
    apiKey: "test-api-key",
    streamSimple: (_model, context) => {
      liveContext = context;
      return createDoneStream(model);
    },
    models: [{
      id: model.id,
      name: model.name,
      api: model.api,
      baseUrl: model.baseUrl,
      reasoning: model.reasoning,
      input: [...model.input],
      cost: model.cost,
      contextWindow: model.contextWindow,
      maxTokens: model.maxTokens,
    }],
  });

  const resolver = new SessionResolver({
    runtime,
    bootstrap,
    channelBus: runtime.createChannelBus(),
    agentId: "shrimpy",
  });
  const plan = await resolver.resolve({
    key: createLocalSessionKey({
      agentId: "shrimpy",
      name: "context-parity",
    }),
    purpose: "test",
    delivery: { kind: "transcript" },
    persistent: false,
    cwd: runtime.getAgentCwd("shrimpy"),
    provider: model.provider,
    model: model.id,
  });
  plan.prepareTurnContext = () =>
    "[turn-context]\nagent: shrimpy\nsession: test\n- deterministic parity fact";

  const inspected = await inspectSessionContext({
    bootstrap,
    plan,
    prompt: "hello from parity test",
  });
  const session = await openSession(bootstrap, plan);
  try {
    await runSessionTurn(session, "hello from parity test");
    assert.ok(liveContext);
    assert.equal(
      normalizeRuntimeTime(inspected.context.systemPrompt),
      normalizeRuntimeTime(liveContext.systemPrompt ?? ""),
    );
    assert.deepEqual(
      stripMessageTimestamps(inspected.context.messages),
      stripMessageTimestamps(liveContext.messages),
    );
    assert.deepEqual(
      inspected.context.tools,
      liveContext.tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })) ?? [],
    );
    assert.deepEqual(inspected.activeToolNames, session.getActiveToolNames());
  } finally {
    disposeSession(session);
    bootstrap.modelRegistry.unregisterProvider(model.provider);
    bootstrap.authStorage.removeRuntimeApiKey(model.provider);
  }
});

function createCaptureModel(): Model<Api> {
  return {
    id: "capture",
    name: "Context Parity Capture",
    api: "openai-completions",
    provider: `context-parity-${process.pid}-${Date.now()}`,
    baseUrl: "https://context-parity.invalid",
    reasoning: false,
    input: ["text"],
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: 128_000,
    maxTokens: 1,
  };
}

function createDoneStream(model: Model<Api>) {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "" }],
    api: model.api,
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
  };
  stream.end(message);
  return stream;
}

function stripMessageTimestamps(messages: Context["messages"]) {
  return messages.map((message) => {
    const copy = structuredClone(message) as Context["messages"][number] & {
      timestamp?: number;
    };
    delete copy.timestamp;
    return copy;
  });
}

function normalizeRuntimeTime(prompt: string): string {
  return prompt.replace(
    /Current time: .*\nCurrent working directory:/,
    "Current time: <runtime>\nCurrent working directory:",
  );
}
