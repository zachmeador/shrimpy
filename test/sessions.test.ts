/**
 * SessionRegistry tests — exercise the real registry with a fake session
 * factory so we validate the actual concurrency and prompt formatting paths.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import {
  createAssistantMessageEventStream,
  type Api,
  type AssistantMessage,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";
import { makeMessage } from "../dist/channels/index.js";
import { SessionRegistry } from "../dist/sessions/registry.js";
import { assembleSessionPrompt } from "../dist/sessions/prompt.js";
import {
  createSessionTurnContextController,
  createTurnContextExtensionFactory,
} from "../dist/sessions/turn-context.js";
import { createShrimpyResourceLoader } from "../dist/sessions/pi-resources.js";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import {
  formatChannelMessage,
  renderTurnContext,
} from "../dist/context/index.js";
import { createGatewaySessionDescriptor } from "../dist/sessions/spec.js";

type Listener = (event: { type: string; messages?: unknown[] }) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const STABLE_SYSTEM_PROMPT = "# SOUL\n\nStable cacheable identity.";

function createCaptureModel(provider = "shrimpy-context-capture"): Model<Api> {
  return {
    id: "capture-model",
    name: "Capture Model",
    api: "openai-completions",
    provider,
    baseUrl: "https://example.invalid",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };
}

function createDoneStream(api: Api, provider: string): ReturnType<typeof createAssistantMessageEventStream> {
  const stream = createAssistantMessageEventStream();
  const message: AssistantMessage = {
    role: "assistant",
    content: [{ type: "text", text: "ok" }],
    api,
    provider,
    model: "capture-model",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
  stream.end(message);
  return stream;
}

function messageText(message: unknown): string {
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      typeof block === "object" && block !== null && "text" in block
        ? String((block as { text?: unknown }).text ?? "")
        : ""
    )
    .join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(value: string, pattern: string): number {
  return value.split(pattern).length - 1;
}

function createMockSession(opts?: {
  turnDurationMs?: number;
  systemPrompt?: string;
}) {
  const turnDuration = opts?.turnDurationMs ?? 10;
  const listeners: Listener[] = [];
  const prompts: string[] = [];
  const llmPromptBatches: string[][] = [];
  const systemPromptSnapshots: string[] = [];
  const thinkingChanges: string[] = [];
  let beforePrompt: ((text: string) => Promise<void>) | undefined;
  let rewriteMessage: ((message: any) => any | undefined) | undefined;

  const session = {
    prompts,
    llmPromptBatches,
    systemPrompt: opts?.systemPrompt ?? STABLE_SYSTEM_PROMPT,
    systemPromptSnapshots,
    thinkingChanges,
    thinkingLevel: "off",
    disposed: false,
    agent: {
      state: {
        messages: [] as any[],
      },
      transformContext: undefined as
        | ((messages: any[], signal?: AbortSignal) => Promise<any[]>)
        | undefined,
    },
    setBeforePrompt(fn: (text: string) => Promise<void>): void {
      beforePrompt = fn;
    },
    setRewriteMessage(fn: (message: any) => any | undefined): void {
      rewriteMessage = fn;
    },
    subscribe(listener: Listener): () => void {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    async prompt(text: string): Promise<void> {
      systemPromptSnapshots.push(session.systemPrompt);
      await beforePrompt?.(text);
      let message = {
        role: "user",
        content: [{ type: "text", text }],
        timestamp: Date.now(),
      };
      message = rewriteMessage?.(message) ?? message;
      prompts.push(messageText(message));
      const modelMessages = session.agent.transformContext
        ? await session.agent.transformContext([
          ...session.agent.state.messages,
          message,
        ])
        : [...session.agent.state.messages, message];
      llmPromptBatches.push(modelMessages.map((item: any) =>
        Array.isArray(item.content)
          ? item.content
            .filter((block: any) => block.type === "text")
            .map((block: any) => block.text)
            .join("")
          : "",
      ));
      session.agent.state.messages.push(message);
      await sleep(turnDuration);
      for (const listener of [...listeners]) {
        listener({ type: "agent_end", messages: [] });
      }
    },
    setThinkingLevel(level: string): void {
      session.thinkingLevel = level;
      thinkingChanges.push(level);
    },
    dispose(): void {
      session.disposed = true;
    },
  };

  return session;
}

function createFakeBootstrap(workspacePath = "/tmp/shrimpy-test-workspace") {
  return {
    agentId: "shrimpy",
    agentRootPath: workspacePath,
    workspacePath,
    bootEnv: {},
    contextConfig: {
      sources: [],
      env: [],
      channels: {},
      agents: {},
    },
    runtimeConfig: {
      noSkills: true,
    },
    baseSystemPrompt: STABLE_SYSTEM_PROMPT,
    baseSystemSections: [{
      id: "base:SOUL.md",
      title: "SOUL.md",
      kind: "identity",
      source: "test",
      reason: "test stable base context",
      content: STABLE_SYSTEM_PROMPT,
    }],
  } as any;
}

function createRegistry(
  sessionFactory: ReturnType<typeof createSessionFactory>,
  workspacePath?: string,
  opts?: {
    turnContextForMessage?: ConstructorParameters<typeof SessionRegistry>[1]["turnContextForMessage"];
  },
) {
  const bootstrap = createFakeBootstrap(workspacePath);
  return new SessionRegistry(bootstrap, {
    sessionFactory: sessionFactory.factory as any,
    planForChannel: (channel) => ({
      descriptor: createGatewaySessionDescriptor({
        workspacePath: bootstrap.workspacePath,
        channel,
      }),
    }),
    turnContextForMessage: opts?.turnContextForMessage,
  });
}

function createSessionFactory(opts?: {
  turnDurationMs?: number;
  creationDelayMs?: number;
}) {
  const sessions: Array<ReturnType<typeof createMockSession>> = [];
  const createSessionOpts: any[] = [];
  let calls = 0;

  const factory = async (_bootstrap?: unknown, createOpts?: unknown) => {
    calls++;
    await sleep(opts?.creationDelayMs ?? 0);
    createSessionOpts.push(createOpts);
    const assembly = createOpts
      ? assembleSessionPrompt(_bootstrap as any, createOpts as any)
      : undefined;
    const session = createMockSession({
      turnDurationMs: opts?.turnDurationMs,
      systemPrompt: assembly?.systemPrompt,
    });
    const controller = createSessionTurnContextController({
      prepare: (createOpts as any)?.prepareTurnContext,
    });
    session.setBeforePrompt((text) => controller.prepareForPrompt(text));
    session.setRewriteMessage((message) => controller.rewriteMessage(message));
    session.agent.transformContext = async (messages) => controller.transform(messages);
    sessions.push(session);
    return session as any;
  };

  return {
    factory,
    sessions,
    createSessionOpts,
    get calls() {
      return calls;
    },
  };
}

function humanText(text: string) {
  return makeMessage({
    sender: {
      kind: "human",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "alice",
    },
    origin: {
      transport: "telegram",
      transportUserId: "42",
      transportChatId: "123",
    },
    content: {
      type: "text",
      data: { text },
    },
  });
}

function humanImage() {
  return makeMessage({
    sender: {
      kind: "human",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "alice",
    },
    origin: {
      transport: "telegram",
      transportUserId: "42",
      transportChatId: "123",
    },
    content: {
      type: "image",
      data: {
        path: "/tmp/image.jpg",
        caption: "caption",
      },
    },
  });
}

function humanImageGroup() {
  return makeMessage({
    sender: {
      kind: "human",
      actorId: "human:user:alice",
      userId: "user:alice",
      displayName: "alice",
    },
    origin: {
      transport: "telegram",
      transportUserId: "42",
      transportChatId: "123",
    },
    content: {
      type: "image_group",
      data: {
        paths: ["/tmp/image-a.jpg", "/tmp/image-b.jpg"],
        caption: "album caption",
      },
    },
  });
}

function watchSystemMessage() {
  return makeMessage({
    sender: {
      kind: "system",
      actorId: "system:watch-runner",
      displayName: "watch-runner",
    },
    origin: {
      transport: "watch",
      watchId: "system.maintenance",
      sourceChannel: "maintenance",
    },
    content: {
      type: "system",
      data: {
        trigger: "watch",
      },
    },
  });
}

describe("formatMessage", () => {
  test("includes channel and sender metadata for text messages", () => {
    const message = humanText("hello there");

    assert.equal(
      formatChannelMessage("telegram~shrimpy~123", message),
      "[channel: telegram~shrimpy~123, sender: human:alice]\nhello there",
    );
  });

  test("formats image, image group, and system messages with the same header", () => {
    const image = humanImage();
    const imageGroup = humanImageGroup();
    const system = watchSystemMessage();

    assert.equal(
      formatChannelMessage("telegram~shrimpy~123", image),
      "[channel: telegram~shrimpy~123, sender: human:alice]\n[Image: /tmp/image.jpg]\ncaption",
    );
    assert.equal(
      formatChannelMessage("telegram~shrimpy~123", imageGroup),
      "[channel: telegram~shrimpy~123, sender: human:alice]\n[Image: /tmp/image-a.jpg]\n[Image: /tmp/image-b.jpg]\nalbum caption",
    );
    assert.equal(
      formatChannelMessage("maintenance", system),
      '[channel: maintenance, sender: system:watch-runner]\n[System: {"trigger":"watch"}]',
    );
  });
});

describe("createGatewaySessionDescriptor", () => {
  test("stores channel sessions directly under the agent session root", () => {
    const descriptor = createGatewaySessionDescriptor({
      workspacePath: "/tmp/shrimpy-test-workspace",
      agentId: "career-shrimpy",
      channel: "telegram~shrimpy~123",
    });

    assert.equal(
      descriptor.sessionDir,
      "/tmp/shrimpy-test-workspace/sessions/telegram_shrimpy_123",
    );
  });

  test("does not infer a skill session type from skill-like channel names", () => {
    const descriptor = createGatewaySessionDescriptor({
      workspacePath: "/tmp/shrimpy-test-workspace",
      channel: "skill~jobs~weather-check",
    });

    assert.equal(descriptor.kind, "gateway");
  });
});

describe("turn context Pi extension", () => {
  test("replaces Pi prompt appendices with the contained Shrimpy prompt", async () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-pi-prompt-"));
    const cwd = join(root, "cwd");
    const agentDir = join(root, "agent");
    const skillDir = join(root, "skill");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: sample-skill",
        "description: Sample skill for prompt containment.",
        "---",
        "",
        "# Sample Skill",
      ].join("\n"),
      "utf-8",
    );

    const model = createCaptureModel(`capture-${Date.now()}`);
    const capturedSystemPrompts: string[] = [];
    const settingsManager = SettingsManager.inMemory({});
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    authStorage.setRuntimeApiKey(model.provider, "test-api-key");
    const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    modelRegistry.registerProvider(model.provider, {
      api: model.api,
      baseUrl: model.baseUrl,
      apiKey: "test-api-key",
      streamSimple: (_model, context) => {
        capturedSystemPrompts.push(context.systemPrompt);
        return createDoneStream(model.api, model.provider);
      },
      models: [{
        id: model.id,
        name: model.name,
        api: model.api,
        baseUrl: model.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: model.cost,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      }],
    });

    const resourceLoader = createShrimpyResourceLoader({
      cwd,
      settingsManager,
      runtimeConfig: resolveRuntimeConfig({ noPromptTemplates: true }),
      systemPrompt: "[context base:test identity]\n\n# BASE",
      skillPaths: [join(skillDir, "SKILL.md")],
    });
    await resourceLoader.reload();

    const sessionManager = SessionManager.inMemory(cwd);
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model,
      authStorage,
      modelRegistry,
      settingsManager,
      sessionManager,
      resourceLoader,
    });

    try {
      await session.prompt("hello from pi");

      assert.equal(capturedSystemPrompts.length, 1);
      const prompt = capturedSystemPrompts[0]!;
      assert.match(prompt, /^\[context base:test identity\]\n\n# BASE/);
      assert.match(prompt, /\[context pi:available_skills capability\]/);
      assert.match(prompt, /<name>sample-skill<\/name>/);
      assert.match(prompt, /\[context pi:runtime_facts runtime\]/);
      assert.match(prompt, /Current time: .*; UTC: \d{4}-\d{2}-\d{2}T/);
      assert.match(prompt, new RegExp(`\\(${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC[+-]\\d{2}:\\d{2}\\)`));
      assert.match(prompt, new RegExp(`Current working directory: ${escapeRegExp(cwd)}`));
      assert.match(prompt, /\[end context\]$/);
      assert.equal((prompt.match(/<available_skills>/g) ?? []).length, 1);
      assert.equal((prompt.match(/Current time:/g) ?? []).length, 1);
    } finally {
      session.dispose();
      modelRegistry.unregisterProvider(model.provider);
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("persists turn context through Pi's real user message path", async () => {
    const root = mkdtempSync(join(tmpdir(), "shrimpy-pi-context-"));
    const cwd = join(root, "cwd");
    const agentDir = join(root, "agent");
    mkdirSync(cwd, { recursive: true });
    mkdirSync(agentDir, { recursive: true });

    const model = createCaptureModel(`capture-${Date.now()}`);
    const capturedContexts: Context[] = [];
    const settingsManager = SettingsManager.inMemory({});
    const authStorage = AuthStorage.create(join(agentDir, "auth.json"));
    authStorage.setRuntimeApiKey(model.provider, "test-api-key");
    const modelRegistry = ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    modelRegistry.registerProvider(model.provider, {
      api: model.api,
      baseUrl: model.baseUrl,
      apiKey: "test-api-key",
      streamSimple: (_model, context) => {
        capturedContexts.push(context);
        return createDoneStream(model.api, model.provider);
      },
      models: [{
        id: model.id,
        name: model.name,
        api: model.api,
        baseUrl: model.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: model.cost,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
      }],
    });

    const controller = createSessionTurnContextController({
      prepare: (prompt) =>
        prompt === "hello from pi"
          ? "prepared by Pi before_agent_start"
          : undefined,
    });
    const resourceLoader = new DefaultResourceLoader({
      cwd,
      agentDir,
      settingsManager,
      extensionFactories: [createTurnContextExtensionFactory(controller)],
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      systemPrompt: STABLE_SYSTEM_PROMPT,
    });
    await resourceLoader.reload();

    const sessionManager = SessionManager.inMemory(cwd);
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model,
      authStorage,
      modelRegistry,
      settingsManager,
      sessionManager,
      resourceLoader,
    });

    try {
      await session.prompt("hello from pi");

      assert.equal(capturedContexts.length, 1);
      const providerText = capturedContexts[0].messages.map(messageText).join("\n");
      assert.match(providerText, /<context>\nprepared by Pi before_agent_start/);
      assert.match(providerText, /The context above is background for the user message below/);
      assert.match(providerText, /hello from pi/);

      const persistedText = (session as any).messages.map(messageText).join("\n");
      assert.match(persistedText, /hello from pi/);
      assert.match(persistedText, /<context>\nprepared by Pi before_agent_start/);
      assert.match(persistedText, /ok/);
    } finally {
      session.dispose();
      modelRegistry.unregisterProvider(model.provider);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("SessionRegistry", () => {
  test("deduplicates concurrent session creation per channel", async () => {
    const sessionFactory = createSessionFactory({ creationDelayMs: 20 });
    const registry = createRegistry(sessionFactory);

    await Promise.all([
      registry.dispatch("telegram~shrimpy~123", humanText("first")),
      registry.dispatch("telegram~shrimpy~123", humanText("second")),
    ]);

    assert.equal(sessionFactory.calls, 1);
  });

  test("serializes dispatches on one session in FIFO order", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 20 });
    const registry = createRegistry(sessionFactory);

    const first = humanText("first");
    const second = humanText("second");
    const third = humanText("third");

    await Promise.all([
      registry.dispatch("telegram~shrimpy~1", first),
      registry.dispatch("telegram~shrimpy~1", second),
      registry.dispatch("telegram~shrimpy~1", third),
    ]);

    assert.equal(sessionFactory.calls, 1);
    assert.equal(sessionFactory.sessions.length, 1);
    assert.deepEqual(sessionFactory.sessions[0].prompts, [
      formatChannelMessage("telegram~shrimpy~1", first),
      formatChannelMessage("telegram~shrimpy~1", second),
      formatChannelMessage("telegram~shrimpy~1", third),
    ]);
  });

  test("persists turn context in the prompt sent to the model", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const registry = createRegistry(sessionFactory, undefined, {
      turnContextForMessage: () => ({
        agentId: "shrimpy",
        channel: "telegram~shrimpy~1",
        sessionType: "gateway",
        capturedAt: "Wed, 04/29/2026, 00:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T04:00:00.000Z",
        maxChars: 2000,
        items: [{
          id: "test",
          summary: "prior thing happened",
          inspect: "shrimpy channels read telegram~shrimpy~1",
        }],
      }),
    });
    const message = humanText("hello");

    await registry.dispatch("telegram~shrimpy~1", message);

    assert.equal(sessionFactory.sessions[0].prompts.length, 1);
    assert.match(
      sessionFactory.sessions[0].prompts[0],
      /^<context>\n\[turn-context\][\s\S]*prior thing happened[\s\S]*<\/context>/,
    );
    assert.match(
      sessionFactory.sessions[0].prompts[0],
      /\[channel: telegram~shrimpy~1, sender: human:alice\]\nhello$/,
    );
    const modelBatch = sessionFactory.sessions[0].llmPromptBatches[0];
    assert.equal(modelBatch.length, 1);
    assert.match(
      modelBatch[0],
      /^<context>\n\[turn-context\][\s\S]*prior thing happened[\s\S]*<\/context>/,
    );
    assert.doesNotMatch(modelBatch.join("\n"), /\[incoming\]/);
  });

  test("persists prepared session context through the same user message path", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const bootstrap = createFakeBootstrap();
    const registry = new SessionRegistry(bootstrap, {
      sessionFactory: sessionFactory.factory as any,
      planForChannel: (channel) => ({
        descriptor: createGatewaySessionDescriptor({
          workspacePath: bootstrap.workspacePath,
          channel,
        }),
        prepareTurnContext: async () => "prepared direct/TUI-style context",
      }),
    });
    const message = humanText("hello");

    await registry.dispatch("local", message);

    const session = sessionFactory.sessions[0];
    assert.match(
      session.prompts[0],
      /^<context>\nprepared direct\/TUI-style context[\s\S]*<\/context>/,
    );
    assert.match(
      session.llmPromptBatches[0][0],
      /\[channel: local, sender: human:alice\]\nhello$/,
    );
  });

  test("keeps routed turn context out of the stable system prompt for prompt caching", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const registry = createRegistry(sessionFactory, undefined, {
      turnContextForMessage: (_channel, message) => {
        const text = message.content.type === "text"
          ? message.content.data.text
          : "unknown";
        return {
          agentId: "shrimpy",
          channel: "telegram~shrimpy~1",
          sessionType: "gateway",
          capturedAt: "Wed, 04/29/2026, 00:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T04:00:00.000Z",
          maxChars: 2000,
          items: [{
            id: `turn:${text}`,
            summary: `${text} live turn context`,
            inspect: `shrimpy channels read telegram~shrimpy~1 --text ${text}`,
          }],
        };
      },
    });

    await registry.dispatch("telegram~shrimpy~1", humanText("first"));
    await registry.dispatch("telegram~shrimpy~1", humanText("second"));

    assert.equal(sessionFactory.calls, 1);
    const session = sessionFactory.sessions[0];
    assert.equal(session.prompts.length, 2);
    assert.notEqual(session.prompts[0], session.prompts[1]);
    assert.deepEqual(session.systemPromptSnapshots, [
      session.systemPrompt,
      session.systemPrompt,
    ]);
    assert.match(session.systemPrompt, /# SOUL/);
    assert.match(session.systemPrompt, /## Delivery/);
    assert.doesNotMatch(
      session.systemPrompt,
      /<context>|\[turn-context\]|first live turn context|second live turn context/,
    );
    assert.match(
      session.prompts[0],
      /first live turn context[\s\S]*\[channel: telegram~shrimpy~1, sender: human:alice\]\nfirst$/,
    );
    assert.match(
      session.prompts[1],
      /second live turn context[\s\S]*\[channel: telegram~shrimpy~1, sender: human:alice\]\nsecond$/,
    );
    assert.match(
      session.llmPromptBatches[0].join("\n"),
      /first live turn context[\s\S]*\[channel: telegram~shrimpy~1, sender: human:alice\]\nfirst/,
    );
    assert.match(
      session.llmPromptBatches[1].join("\n"),
      /second live turn context[\s\S]*\[channel: telegram~shrimpy~1, sender: human:alice\]\nsecond/,
    );
  });

  test("does not add new routed turn context to later context-less turns", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const registry = createRegistry(sessionFactory, undefined, {
      turnContextForMessage: (_channel, message) => {
        const text = message.content.type === "text"
          ? message.content.data.text
          : "";
        if (text !== "first") return undefined;
        return {
          agentId: "shrimpy",
          channel: "telegram~shrimpy~1",
          sessionType: "gateway",
          capturedAt: "Wed, 04/29/2026, 00:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T04:00:00.000Z",
          maxChars: 2000,
          items: [{
            id: "turn:first",
            summary: "first-only live turn context",
          }],
        };
      },
    });
    const first = humanText("first");
    const second = humanText("second");

    await registry.dispatch("telegram~shrimpy~1", first);
    await registry.dispatch("telegram~shrimpy~1", second);

    const session = sessionFactory.sessions[0];
    assert.match(
      session.llmPromptBatches[0].join("\n"),
      /first-only live turn context/,
    );
    assert.equal(
      session.prompts[1],
      formatChannelMessage("telegram~shrimpy~1", second),
    );
    assert.equal(
      countMatches(session.llmPromptBatches[1].join("\n"), "first-only live turn context"),
      1,
    );
  });

  test("renders turn context text from structured data", () => {
    const text = renderTurnContext({
      agentId: "shrimpy",
      channel: "telegram~shrimpy~1",
      sessionType: "gateway",
      capturedAt: "Wed, 04/29/2026, 00:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T04:00:00.000Z",
      maxChars: 2000,
      items: [{
        id: "test",
        summary: "prior thing happened",
        inspect: "shrimpy channels read telegram~shrimpy~1",
      }],
    });

    assert.equal(text, [
      "[turn-context]",
      "time: Wed, 04/29/2026, 00:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T04:00:00.000Z",
      "agent: shrimpy",
      "session: gateway channel: telegram~shrimpy~1",
      "- prior thing happened",
      "  inspect: shrimpy channels read telegram~shrimpy~1",
    ].join("\n"));
  });

  test("creates separate sessions for different channels", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const registry = createRegistry(sessionFactory);

    const first = humanText("hello from telegram");
    const second = humanText("hello from cli");

    await Promise.all([
      registry.dispatch("telegram~shrimpy~1", first),
      registry.dispatch("local", second),
    ]);

    assert.equal(sessionFactory.calls, 2);
    assert.equal(sessionFactory.sessions.length, 2);
    assert.deepEqual(sessionFactory.sessions[0].prompts, [
      formatChannelMessage("telegram~shrimpy~1", first),
    ]);
    assert.deepEqual(sessionFactory.sessions[1].prompts, [
      formatChannelMessage("local", second),
    ]);
  });

  test("disposeAll waits for pending creation and disposes created sessions", async () => {
    const sessionFactory = createSessionFactory({ creationDelayMs: 30 });
    const registry = createRegistry(sessionFactory);

    const creating = registry.dispatch("telegram~shrimpy~123", humanText("hello"));
    await registry.disposeAll();
    await creating;

    assert.equal(sessionFactory.calls, 1);
    assert.equal(sessionFactory.sessions.length, 1);
    assert.equal(sessionFactory.sessions[0].disposed, true);
  });

  test("disposeAll waits for queued turns to finish before disposing", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 20 });
    const registry = createRegistry(sessionFactory);

    const first = humanText("first");
    const second = humanText("second");

    const dispatches = Promise.all([
      registry.dispatch("telegram~shrimpy~1", first),
      registry.dispatch("telegram~shrimpy~1", second),
    ]);

    await registry.disposeAll();
    await dispatches;

    assert.equal(sessionFactory.calls, 1);
    assert.equal(sessionFactory.sessions[0].disposed, true);
    assert.deepEqual(sessionFactory.sessions[0].prompts, [
      formatChannelMessage("telegram~shrimpy~1", first),
      formatChannelMessage("telegram~shrimpy~1", second),
    ]);
  });

  test("can set a session thinking level without dispatching a user turn", async () => {
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory);

    const result = await registry.setThinkingLevel("telegram~shrimpy~1", "high" as any);

    assert.equal(sessionFactory.calls, 1);
    assert.deepEqual(sessionFactory.sessions[0].prompts, []);
    assert.deepEqual(sessionFactory.sessions[0].thinkingChanges, ["high"]);
    assert.equal(result.effectiveLevel, "high");
  });

  test("uses the same routed session type regardless of channel name", async () => {
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory);

    await registry.dispatch("telegram~shrimpy~42", humanText("telegram"));
    await registry.dispatch("system-alerts", humanText("system"));
    await registry.dispatch("discord-1", humanText("discord"));

    assert.equal(sessionFactory.createSessionOpts.length, 3);
    assert.equal(sessionFactory.createSessionOpts[0].descriptor.kind, "gateway");
    assert.equal(sessionFactory.createSessionOpts[1].descriptor.kind, "gateway");
    assert.equal(sessionFactory.createSessionOpts[2].descriptor.kind, "gateway");
  });

  test("reset archives the current session file and opens a fresh session on the next turn", async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), "shrimpy-session-reset-test-"));
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory, workspacePath);

    try {
      await registry.dispatch("telegram~shrimpy~1", humanText("first"));
      const sessionDir = sessionFactory.createSessionOpts[0].descriptor.sessionDir;
      mkdirSync(sessionDir, { recursive: true });
      const sessionFile = join(sessionDir, "state.jsonl");
      writeSessionFile(sessionFile, "state");

      const firstSession = sessionFactory.sessions[0];
      const reset = await registry.reset("telegram~shrimpy~1");

      assert.equal(reset.hadSession, true);
      assert.equal(existsSync(sessionDir), true);
      assert.equal(existsSync(sessionFile), true);
      assert.equal(reset.archivedTo, sessionFile);
      assert.match(readFileSync(sessionFile, "utf-8"), /"state":"archived"/);
      assert.equal(firstSession.disposed, true);

      await registry.dispatch("telegram~shrimpy~1", humanText("second"));

      assert.equal(sessionFactory.calls, 2);
    } finally {
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });

  test("restore activates an archived session file and archives the active file", async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), "shrimpy-session-restore-test-"));
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory, workspacePath);

    try {
      await registry.dispatch("telegram~shrimpy~1", humanText("first"));
      const sessionDir = sessionFactory.createSessionOpts[0].descriptor.sessionDir;
      mkdirSync(sessionDir, { recursive: true });
      const stateA = join(sessionDir, "state-a.jsonl");
      const stateB = join(sessionDir, "state-b.jsonl");
      writeSessionFile(stateA, "state-a");
      const firstArchived = await registry.reset("telegram~shrimpy~1");
      assert.ok(firstArchived.archivedTo);

      await registry.dispatch("telegram~shrimpy~1", humanText("second"));
      mkdirSync(sessionDir, { recursive: true });
      writeSessionFile(stateB, "state-b");

      const restored = await registry.restore("telegram~shrimpy~1");

      assert.equal(existsSync(stateA), true);
      assert.equal(existsSync(stateB), true);
      assert.equal(restored.restoredFrom, firstArchived.archivedTo);
      assert.equal(restored.archivedPreviousTo, stateB);
      assert.match(readFileSync(stateA, "utf-8"), /"state":"active"/);
      assert.match(readFileSync(stateB, "utf-8"), /"state":"archived"/);

      await registry.dispatch("telegram~shrimpy~1", humanText("third"));
      assert.equal(sessionFactory.calls, 3);
    } finally {
      rmSync(workspacePath, { recursive: true, force: true });
    }
  });
});

function writeSessionFile(path: string, id: string): void {
  const now = new Date().toISOString();
  writeFileSync(
    path,
    `${JSON.stringify({
      type: "session",
      version: 3,
      id,
      timestamp: now,
      cwd: "/tmp/shrimpy-test-workspace",
    })}\n${JSON.stringify({
      type: "message",
      id: `${id}-root`,
      parentId: null,
      timestamp: now,
      message: {
        role: "assistant",
        content: [{ type: "text", text: id }],
        api: "test",
        provider: "test",
        model: "test",
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
      },
    })}\n`,
    "utf-8",
  );
}
