/**
 * SessionPool tests — exercise the real pool with a fake session
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
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
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
import { makeMessage } from "../dist/channels/protocol.js";
import { SessionPool } from "../dist/sessions/pool.js";
import { assembleSessionPrompt } from "../dist/context/session-prompt.js";
import {
  createSessionTurnContextController,
  createTurnContextExtensionFactory,
  normalizeTurnContextMessages,
  TURN_CONTEXT_CUSTOM_TYPE,
} from "../dist/sessions/turn-context.js";
import { createShrimpyResourceLoader } from "../dist/sessions/pi-resources.js";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { formatChannelMessage } from "../dist/context/turn/channel-message.js";
import { renderTurnContext } from "../dist/context/turn/render.js";
import { createChannelSessionKey } from "../dist/sessions/identity.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";

type SessionEvent = { type: string; [key: string]: unknown };
type Listener = (event: SessionEvent) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 500,
): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error("timed out waiting for condition");
    }
    await sleep(5);
  }
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
  sessionId?: string;
}) {
  const turnDuration = opts?.turnDurationMs ?? 10;
  const listeners: Listener[] = [];
  const prompts: string[] = [];
  const llmPromptBatches: string[][] = [];
  const systemPromptSnapshots: string[] = [];
  const thinkingChanges: string[] = [];
  const modelChanges: Array<Model<Api>> = [];
  let beforePrompt: ((text: string) => Promise<void>) | undefined;
  let rewriteMessage: ((message: any) => any | undefined) | undefined;

  const session = {
    prompts,
    llmPromptBatches,
    systemPrompt: opts?.systemPrompt ?? STABLE_SYSTEM_PROMPT,
    systemPromptSnapshots,
    thinkingChanges,
    modelChanges,
    thinkingLevel: "off",
    model: undefined as Model<Api> | undefined,
    disposed: false,
    sessionManager: {
      getSessionId: () => opts?.sessionId ?? "mock-session",
    },
    get listenerCount(): number {
      return listeners.length;
    },
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
    emit(event: SessionEvent): void {
      for (const listener of [...listeners]) listener(event);
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
    async setModel(model: Model<Api>): Promise<void> {
      session.model = model;
      modelChanges.push(model);
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
    turnContextForMessage?: ConstructorParameters<typeof SessionPool>[1]["turnContextForMessage"];
    markTurnContextDelivered?: ConstructorParameters<typeof SessionPool>[1]["markTurnContextDelivered"];
    startActivity?: ConstructorParameters<typeof SessionPool>[1]["startActivity"];
    onCompactionEnd?: ConstructorParameters<typeof SessionPool>[1]["onCompactionEnd"];
    reviewCompletedTurn?: ConstructorParameters<typeof SessionPool>[1]["reviewCompletedTurn"];
  },
) {
  const bootstrap = createFakeBootstrap(workspacePath);
  return new SessionPool(bootstrap, {
    sessionFactory: sessionFactory.factory as any,
    planForChannel: (channel) => ({
      descriptor: channelDescriptor(bootstrap.agentRootPath, channel),
    }),
    turnContextForMessage: opts?.turnContextForMessage,
    markTurnContextDelivered: opts?.markTurnContextDelivered,
    startActivity: opts?.startActivity,
    onCompactionEnd: opts?.onCompactionEnd,
    reviewCompletedTurn: opts?.reviewCompletedTurn,
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
      sessionId: `mock-session-${calls}`,
    });
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

describe("channel session descriptor", () => {
  test("stores channel sessions under a collision-free namespace", () => {
    const descriptor = channelDescriptor(
      "/tmp/shrimpy-test-workspace",
      "telegram~shrimpy~123",
      "career-shrimpy",
    );

    assert.equal(descriptor.storage.kind, "durable");
    assert.match(
      descriptor.storage.kind === "durable" ? descriptor.storage.dir : "",
      /\/sessions\/channel\/[^/]+\/[^/]+$/,
    );
    assert.equal(descriptor.key.namespace, "channel");
  });

  test("does not infer a skill session type from skill-like channel names", () => {
    const descriptor = channelDescriptor(
      "/tmp/shrimpy-test-workspace",
      "skill~jobs~weather-check",
    );

    assert.equal(descriptor.purpose, "channel");
    assert.deepEqual(descriptor.delivery, {
      kind: "channel",
      channel: "skill~jobs~weather-check",
    });
  });
});

describe("turn context Pi extension", () => {
  test("renders turn context only when Ctrl+O expansion is active", () => {
    const renderers = new Map<string, (...args: any[]) => any>();
    const handlers = new Map<string, (...args: any[]) => any>();
    const extension = createTurnContextExtensionFactory(
      createSessionTurnContextController({
        prepare: () => "[turn-context]\nprepared context",
      }),
    );

    extension({
      registerMessageRenderer(customType: string, next: (...args: any[]) => any) {
        renderers.set(customType, next);
      },
      on(event: string, handler: (...args: any[]) => any) {
        handlers.set(event, handler);
      },
    } as any);

    const turnContextRenderer = renderers.get(TURN_CONTEXT_CUSTOM_TYPE);
    assert.ok(turnContextRenderer);
    const theme = {
      fg: (_color: string, text: string) => text,
    };
    const message = {
      role: "custom",
      customType: TURN_CONTEXT_CUSTOM_TYPE,
      content: "model-facing context",
      display: true,
      details: { text: "[turn-context]\nprepared context" },
      timestamp: Date.now(),
    };

    assert.deepEqual(turnContextRenderer(message, { expanded: false }, theme).render(80), []);
    assert.match(
      turnContextRenderer(message, { expanded: true }, theme).render(80).join("\n"),
      /^\s*\[turn-context\][\s\S]*prepared context/,
    );
    assert.ok(handlers.has("before_agent_start"));
    assert.ok(handlers.has("context"));
  });

  test("normalizes turn-context attachments into the provider user message", () => {
    const timestamp = Date.now();
    const messages = [
      {
        role: "assistant",
        content: [{ type: "text", text: "previous response" }],
        timestamp: timestamp - 2,
      },
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          {
            type: "image",
            mimeType: "image/png",
            data: "ZmFrZQ==",
          },
        ],
        timestamp: timestamp - 1,
      },
      {
        role: "custom",
        customType: "other-context",
        content: "keep me",
        display: true,
        timestamp,
      },
      {
        role: "custom",
        customType: TURN_CONTEXT_CUSTOM_TYPE,
        content: "stored trailing form",
        display: true,
        details: { text: "[turn-context]\nprepared context" },
        timestamp,
      },
    ] as any[];

    const normalized = normalizeTurnContextMessages(messages);

    assert.notEqual(normalized, messages);
    assert.equal(normalized.length, 3);
    assert.equal(normalized[1].role, "user");
    assert.match(
      messageText(normalized[1]),
      /^\[turn-context\][\s\S]*prepared context[\s\S]*The turn context above is background for the user message below[\s\S]*describe this$/,
    );
    assert.equal(
      (normalized[1] as any).content.some((part: any) => part.type === "image"),
      true,
    );
    assert.equal((normalized[2] as any).customType, "other-context");
    assert.equal(messages.length, 4);
    assert.equal(messageText(messages[1]), "describe this");
  });

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
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
      modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false,
    });
    modelRuntime.registerProvider(model.provider, {
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
    await modelRuntime.setRuntimeApiKey(
      model.provider,
      "test-api-key",
      { allowNetwork: false },
    );

    const resourceLoader = createShrimpyResourceLoader({
      cwd,
      settingsManager,
      modelRuntime,
      runtimeConfig: resolveRuntimeConfig({ noPromptTemplates: true }),
      systemPrompt: `<context path="test/base">\n# BASE\n</context>`,
      skillPaths: [join(skillDir, "SKILL.md")],
    });
    await resourceLoader.reload();

    const sessionManager = SessionManager.inMemory(cwd);
    const { session } = await createAgentSession({
      cwd,
      agentDir,
      model,
      modelRuntime,
      settingsManager,
      sessionManager,
      resourceLoader,
    });

    try {
      await session.prompt("hello from pi");

      assert.equal(capturedSystemPrompts.length, 1);
      const prompt = capturedSystemPrompts[0]!;
      assert.match(prompt, /^<context path="test\/base">\n# BASE/);
      assert.match(prompt, /<context path="pi\/available_skills">/);
      assert.match(prompt, /<name>sample-skill<\/name>/);
      assert.match(prompt, /<context path="pi\/runtime_facts">/);
      assert.match(prompt, /Current time: .*; UTC: \d{4}-\d{2}-\d{2}T/);
      assert.match(prompt, new RegExp(`\\(${Intl.DateTimeFormat().resolvedOptions().timeZone}, UTC[+-]\\d{2}:\\d{2}\\)`));
      assert.match(prompt, new RegExp(`Current working directory: ${escapeRegExp(cwd)}`));
      assert.doesNotMatch(prompt, /\[end context\]/);
      assert.equal((prompt.match(/<available_skills>/g) ?? []).length, 1);
      assert.equal((prompt.match(/Current time:/g) ?? []).length, 1);
    } finally {
      session.dispose();
      modelRuntime.unregisterProvider(model.provider);
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
    const modelRuntime = await ModelRuntime.create({
      authPath: join(agentDir, "auth.json"),
      modelsPath: join(agentDir, "models.json"),
      modelsStorePath: join(agentDir, "models-store.json"),
      allowModelNetwork: false,
    });
    modelRuntime.registerProvider(model.provider, {
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
    await modelRuntime.setRuntimeApiKey(
      model.provider,
      "test-api-key",
      { allowNetwork: false },
    );

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
      modelRuntime,
      settingsManager,
      sessionManager,
      resourceLoader,
    });

    try {
      await session.prompt("hello from pi");

      assert.equal(capturedContexts.length, 1);
      assert.equal(capturedContexts[0].messages.length, 1);
      const providerText = messageText(capturedContexts[0].messages[0]);
      assert.match(
        providerText,
        /^prepared by Pi before_agent_start[\s\S]*The turn context above is background for the user message below[\s\S]*hello from pi$/,
      );
      assert.doesNotMatch(providerText, /<context>\nprepared by Pi before_agent_start/);

      const persistedText = (session as any).messages.map(messageText).join("\n");
      assert.match(persistedText, /hello from pi/);
      assert.match(persistedText, /prepared by Pi before_agent_start/);
      assert.match(
        persistedText,
        /The turn context above is background for the user message immediately before it/,
      );
      assert.match(persistedText, /ok/);
      assert.doesNotMatch(persistedText, /<context>\nprepared by Pi before_agent_start/);
      assert.equal((session as any).messages[0].role, "user");
      assert.equal(messageText((session as any).messages[0]), "hello from pi");
      assert.equal((session as any).messages[1].role, "custom");
      assert.equal((session as any).messages[1].display, true);
      assert.deepEqual((session as any).messages[1].details, {
        text: "prepared by Pi before_agent_start",
      });
    } finally {
      session.dispose();
      modelRuntime.unregisterProvider(model.provider);
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("SessionPool", () => {
  test("does not install compaction delivery without a scoped handler", async () => {
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory);

    await registry.dispatch("telegram~shrimpy~1", humanText("hello"));

    assert.equal(sessionFactory.sessions[0].listenerCount, 0);
    assert.doesNotThrow(() => {
      sessionFactory.sessions[0].emit({
        type: "compaction_end",
        reason: "threshold",
        result: undefined,
        aborted: false,
        willRetry: false,
        errorMessage: "provider unavailable",
      });
    });
  });

  test("forwards compaction end events only while the channel session is active", async () => {
    const sessionFactory = createSessionFactory();
    const events: Array<{ channel: string; errorMessage?: string }> = [];
    const registry = createRegistry(sessionFactory, undefined, {
      onCompactionEnd: (channel, event) => {
        events.push({ channel, errorMessage: event.errorMessage });
      },
    });

    await registry.dispatch("telegram~shrimpy~1", humanText("hello"));
    const session = sessionFactory.sessions[0];
    session.emit({
      type: "compaction_start",
      reason: "threshold",
    });
    session.emit({
      type: "compaction_end",
      reason: "threshold",
      result: undefined,
      aborted: false,
      willRetry: false,
      errorMessage: "provider unavailable",
    });

    assert.deepEqual(events, [{
      channel: "telegram~shrimpy~1",
      errorMessage: "provider unavailable",
    }]);

    await registry.disposeAll();
    session.emit({
      type: "compaction_end",
      reason: "threshold",
      result: undefined,
      aborted: false,
      willRetry: false,
      errorMessage: "stale event",
    });
    assert.equal(events.length, 1);
  });

  test("isolates compaction end handler failures from the session event", async () => {
    const sessionFactory = createSessionFactory();
    const errors: string[] = [];
    const originalError = console.error;
    const registry = createRegistry(sessionFactory, undefined, {
      onCompactionEnd: () => {
        throw new Error("status append failed");
      },
    });

    await registry.dispatch("telegram~shrimpy~1", humanText("hello"));
    console.error = (...args: unknown[]) => {
      errors.push(args.map((value) => String(value)).join(" "));
    };
    try {
      assert.doesNotThrow(() => {
        sessionFactory.sessions[0].emit({
          type: "compaction_end",
          reason: "threshold",
          result: undefined,
          aborted: false,
          willRetry: false,
          errorMessage: "provider unavailable",
        });
      });
    } finally {
      console.error = originalError;
      await registry.disposeAll();
    }

    assert.match(errors.join("\n"), /compaction end handler error/);
    assert.match(errors.join("\n"), /status append failed/);
  });

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

  test("runs one tagged follow-up when post-turn review requests recovery", async () => {
    const sessionFactory = createSessionFactory();
    let reviews = 0;
    const message = humanText("hello");
    const registry = createRegistry(sessionFactory, undefined, {
      reviewCompletedTurn: async (_channel, _message, turn) => {
        reviews += 1;
        assert.equal(turn.assistantText, "");
        return {
          replyRecovery: "woke",
          followUpPrompt: "[shrimpy:channel-reply-recovery]\nPublish the response.",
        };
      },
    });

    await registry.dispatch("telegram~shrimpy~1", message);

    assert.equal(reviews, 1);
    assert.deepEqual(sessionFactory.sessions[0].prompts, [
      formatChannelMessage("telegram~shrimpy~1", message),
      "[shrimpy:channel-reply-recovery]\nPublish the response.",
    ]);
    assert.equal(
      registry.getLaneState("telegram~shrimpy~1").lastOutcome?.replyRecovery,
      "woke",
    );
  });

  test("records a failed review without failing the completed channel turn", async () => {
    const sessionFactory = createSessionFactory();
    const errors: string[] = [];
    const originalError = console.error;
    const registry = createRegistry(sessionFactory, undefined, {
      reviewCompletedTurn: async () => {
        throw new Error("review unavailable");
      },
    });

    console.error = (...args: unknown[]) => {
      errors.push(args.map((value) => String(value)).join(" "));
    };
    try {
      await registry.dispatch("telegram~shrimpy~1", humanText("hello"));
    } finally {
      console.error = originalError;
    }

    const outcome = registry.getLaneState("telegram~shrimpy~1").lastOutcome;
    assert.equal(outcome?.outcome, "completed");
    assert.equal(outcome?.replyRecovery, "failed");
    assert.match(errors.join("\n"), /channel reply review error/);
  });

  test("starts and stops channel activity around a dispatched turn", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const events: string[] = [];
    const registry = createRegistry(sessionFactory, undefined, {
      startActivity: (channel) => {
        events.push(`start:${channel}`);
        return {
          stop() {
            events.push(`stop:${channel}`);
          },
        };
      },
    });

    await registry.dispatch("telegram~shrimpy~1", humanText("hello"));

    assert.deepEqual(events, [
      "start:telegram~shrimpy~1",
      "stop:telegram~shrimpy~1",
    ]);
  });

  test("continues the turn when channel activity startup fails", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const errors: string[] = [];
    const originalError = console.error;
    const registry = createRegistry(sessionFactory, undefined, {
      startActivity: () => {
        throw new Error("activity unavailable");
      },
    });
    const message = humanText("hello");

    console.error = (...args: unknown[]) => {
      errors.push(args.map((value) => String(value)).join(" "));
    };
    try {
      await registry.dispatch("telegram~shrimpy~1", message);
    } finally {
      console.error = originalError;
    }

    assert.equal(sessionFactory.sessions.length, 1);
    assert.deepEqual(sessionFactory.sessions[0].prompts, [
      formatChannelMessage("telegram~shrimpy~1", message),
    ]);
    assert.match(errors.join("\n"), /activity start error/);
    assert.equal(
      registry.getLaneState("telegram~shrimpy~1").lastOutcome?.outcome,
      "completed",
    );
  });

  test("clears the lane when session preparation fails", async () => {
    let handled = false;
    const pool = new SessionPool(createFakeBootstrap(), {
      planForChannel: () => {
        throw new Error("plan failed");
      },
      markMessageHandled: () => {
        handled = true;
      },
    });
    const originalError = console.error;
    console.error = () => {};
    try {
      await pool.dispatch("telegram~shrimpy~1", humanText("hello"));
    } finally {
      console.error = originalError;
    }

    const lane = pool.getLaneState("telegram~shrimpy~1");
    assert.equal(lane.currentTurn, undefined);
    assert.equal(lane.lastOutcome?.outcome, "errored");
    assert.equal(handled, true);
  });

  test("stops the running turn without waiting for the prompt to finish", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 200 });
    const registry = createRegistry(sessionFactory);
    const message = humanText("long turn");

    const dispatch = registry.dispatch("telegram~shrimpy~1", message);
    await waitFor(() =>
      registry.getLaneState("telegram~shrimpy~1").currentTurn?.messageId === message.id
    );

    const stopped = registry.stop("telegram~shrimpy~1");
    await dispatch;

    const lane = registry.getLaneState("telegram~shrimpy~1");
    assert.equal(stopped.stopped, true);
    assert.equal(stopped.messageId, message.id);
    assert.equal(lane.currentTurn, undefined);
    assert.equal(lane.queueDepth, 0);
    assert.equal(lane.lastOutcome?.messageId, message.id);
    assert.equal(lane.lastOutcome?.outcome, "aborted");
    assert.equal(sessionFactory.sessions[0].disposed, true);
  });

  test("keeps queued turns after stopping the running turn", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 80 });
    const registry = createRegistry(sessionFactory);
    const first = humanText("first");
    const second = humanText("second");

    const dispatches = Promise.all([
      registry.dispatch("telegram~shrimpy~1", first),
      registry.dispatch("telegram~shrimpy~1", second),
    ]);
    await waitFor(() => {
      const lane = registry.getLaneState("telegram~shrimpy~1");
      return lane.currentTurn?.messageId === first.id && lane.queueDepth === 1;
    });

    const stopped = registry.stop("telegram~shrimpy~1");
    await dispatches;

    assert.equal(stopped.stopped, true);
    assert.equal(sessionFactory.calls, 2);
    assert.equal(sessionFactory.sessions[0].disposed, true);
    assert.deepEqual(sessionFactory.sessions[1].prompts, [
      formatChannelMessage("telegram~shrimpy~1", second),
    ]);
    const lane = registry.getLaneState("telegram~shrimpy~1");
    assert.equal(lane.queueDepth, 0);
    assert.equal(lane.currentTurn, undefined);
    assert.equal(lane.lastOutcome?.messageId, second.id);
    assert.equal(lane.lastOutcome?.outcome, "completed");
  });

  test("persists turn context in the prompt sent to the model", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    let sessionsAtDelivery = 0;
    let sessionInstanceIdAtContext: string | undefined;
    const registry = createRegistry(sessionFactory, undefined, {
      turnContextForMessage: (_channel, _message, sessionInstanceId) => {
        sessionInstanceIdAtContext = sessionInstanceId;
        return {
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
        };
      },
      markTurnContextDelivered: () => {
        sessionsAtDelivery = sessionFactory.sessions.length;
      },
    });
    const message = humanText("hello");

    await registry.dispatch("telegram~shrimpy~1", message);

    assert.equal(sessionFactory.sessions[0].prompts.length, 1);
    assert.match(
      sessionFactory.sessions[0].prompts[0],
      /^\[turn-context\][\s\S]*prior thing happened[\s\S]*The turn context above/,
    );
    assert.match(
      sessionFactory.sessions[0].prompts[0],
      /This is a channel turn[\s\S]*for a normal response, call reply/,
    );
    assert.doesNotMatch(
      sessionFactory.sessions[0].prompts[0],
      /exactly one/,
    );
    assert.match(
      sessionFactory.sessions[0].prompts[0],
      /\[channel: telegram~shrimpy~1, sender: human:alice\]\nhello$/,
    );
    const modelBatch = sessionFactory.sessions[0].llmPromptBatches[0];
    assert.equal(modelBatch.length, 1);
    assert.match(
      modelBatch[0],
      /^\[turn-context\][\s\S]*prior thing happened[\s\S]*The turn context above/,
    );
    assert.doesNotMatch(modelBatch.join("\n"), /\[incoming\]/);
    assert.equal(sessionsAtDelivery, 1);
    assert.equal(sessionInstanceIdAtContext, "mock-session-1");
  });

  test("persists prepared session context through the same user message path", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const bootstrap = createFakeBootstrap();
    let sessionInstanceIdAtContext: string | undefined;
    const registry = new SessionPool(bootstrap, {
      sessionFactory: sessionFactory.factory as any,
      planForChannel: (channel) => ({
        descriptor: channelDescriptor(bootstrap.agentRootPath, channel),
        prepareTurnContext: async (_prompt, _images, sessionInstanceId) => {
          sessionInstanceIdAtContext = sessionInstanceId;
          return "prepared direct/TUI-style context";
        },
      }),
    });
    const message = humanText("hello");

    await registry.dispatch("local", message);

    const session = sessionFactory.sessions[0];
    assert.equal(sessionFactory.createSessionOpts[0].prepareTurnContext, undefined);
    assert.match(
      session.prompts[0],
      /^prepared direct\/TUI-style context[\s\S]*The turn context above/,
    );
    assert.match(
      session.llmPromptBatches[0][0],
      /\[channel: local, sender: human:alice\]\nhello$/,
    );
    assert.equal(sessionInstanceIdAtContext, "mock-session-1");
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
      /\[turn-context\]|first live turn context|second live turn context/,
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

  test("keeps per-message turn context for identical queued prompts", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const registry = createRegistry(sessionFactory, undefined, {
      turnContextForMessage: (_channel, message) => ({
        agentId: "shrimpy",
        channel: "telegram~shrimpy~1",
        sessionType: "gateway",
        capturedAt: "Wed, 04/29/2026, 00:00:00 EDT (America/New_York, UTC-04:00); UTC: 2026-04-29T04:00:00.000Z",
        maxChars: 2000,
        items: [{
          id: `turn:${message.id}`,
          summary: `context for ${message.id}`,
        }],
      }),
    });
    const first = humanText("same prompt");
    const second = humanText("same prompt");

    await Promise.all([
      registry.dispatch("telegram~shrimpy~1", first),
      registry.dispatch("telegram~shrimpy~1", second),
    ]);

    const session = sessionFactory.sessions[0];
    assert.equal(session.prompts.length, 2);
    assert.equal(session.prompts[0].includes(`context for ${first.id}`), true);
    assert.equal(session.prompts[0].includes(`context for ${second.id}`), false);
    assert.equal(session.prompts[1].includes(`context for ${second.id}`), true);
    assert.equal(session.prompts[1].includes(`context for ${first.id}`), false);
    assert.equal(sessionFactory.createSessionOpts[0].prepareTurnContext, undefined);
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

  test("can set session model and thinking together without dispatching a turn", async () => {
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory);
    const model = {
      ...createCaptureModel("settings-provider"),
      id: "settings-model",
    };

    const result = await registry.setSettings("telegram~shrimpy~1", {
      model,
      thinking: "high" as any,
    });

    assert.equal(sessionFactory.calls, 1);
    assert.deepEqual(sessionFactory.sessions[0].prompts, []);
    assert.deepEqual(sessionFactory.sessions[0].modelChanges, [model]);
    assert.deepEqual(sessionFactory.sessions[0].thinkingChanges, ["high"]);
    assert.deepEqual(result.effectiveModel, {
      provider: "settings-provider",
      id: "settings-model",
    });
    assert.equal(result.effectiveThinking, "high");
  });

  test("uses the same routed session type regardless of channel name", async () => {
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory);

    await registry.dispatch("telegram~shrimpy~42", humanText("telegram"));
    await registry.dispatch("system-alerts", humanText("system"));
    await registry.dispatch("discord-1", humanText("discord"));

    assert.equal(sessionFactory.createSessionOpts.length, 3);
    assert.equal(sessionFactory.createSessionOpts[0].descriptor.purpose, "channel");
    assert.equal(sessionFactory.createSessionOpts[1].descriptor.purpose, "channel");
    assert.equal(sessionFactory.createSessionOpts[2].descriptor.purpose, "channel");
  });

  test("reset archives the current session file and opens a fresh session on the next turn", async () => {
    const workspacePath = mkdtempSync(join(tmpdir(), "shrimpy-session-reset-test-"));
    const sessionFactory = createSessionFactory();
    const registry = createRegistry(sessionFactory, workspacePath);

    try {
      await registry.dispatch("telegram~shrimpy~1", humanText("first"));
      const sessionDir = sessionFactory.createSessionOpts[0].descriptor.storage.dir;
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
      const sessionDir = sessionFactory.createSessionOpts[0].descriptor.storage.dir;
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

function channelDescriptor(
  agentRoot: string,
  channel: string,
  agentId = "shrimpy",
) {
  return createSessionDescriptor({
    agentRoot,
    key: createChannelSessionKey({ agentId, channel }),
    purpose: "channel",
    delivery: { kind: "channel", channel },
  });
}

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
