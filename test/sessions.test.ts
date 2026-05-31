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
import { makeMessage } from "../dist/channels/index.js";
import { SessionRegistry } from "../dist/sessions/registry.js";
import {
  formatChannelMessage,
  renderTurnContext,
} from "../dist/context/index.js";
import { createGatewaySessionDescriptor } from "../dist/sessions/spec.js";

type Listener = (event: { type: string; messages?: unknown[] }) => void;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockSession(opts?: { turnDurationMs?: number }) {
  const turnDuration = opts?.turnDurationMs ?? 10;
  const listeners: Listener[] = [];
  const prompts: string[] = [];
  const thinkingChanges: string[] = [];

  const session = {
    prompts,
    thinkingChanges,
    thinkingLevel: "off",
    disposed: false,
    subscribe(listener: Listener): () => void {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    async prompt(text: string): Promise<void> {
      prompts.push(text);
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
    agentRootPath: workspacePath,
    workspacePath,
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
    const session = createMockSession({
      turnDurationMs: opts?.turnDurationMs,
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

function scheduledSystemMessage() {
  return makeMessage({
    sender: {
      kind: "system",
      actorId: "system:scheduler",
      displayName: "scheduler",
    },
    origin: {
      transport: "scheduler",
      scheduleId: "system.heartbeat",
      sourceChannel: "heartbeat",
    },
    content: {
      type: "system",
      data: {
        trigger: "scheduled",
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
    const system = scheduledSystemMessage();

    assert.equal(
      formatChannelMessage("telegram~shrimpy~123", image),
      "[channel: telegram~shrimpy~123, sender: human:alice]\n[Image: /tmp/image.jpg]\ncaption",
    );
    assert.equal(
      formatChannelMessage("telegram~shrimpy~123", imageGroup),
      "[channel: telegram~shrimpy~123, sender: human:alice]\n[Image: /tmp/image-a.jpg]\n[Image: /tmp/image-b.jpg]\nalbum caption",
    );
    assert.equal(
      formatChannelMessage("heartbeat", system),
      '[channel: heartbeat, sender: system:scheduler]\n[System: {"trigger":"scheduled"}]',
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

  test("injects turn context before the channel message", async () => {
    const sessionFactory = createSessionFactory({ turnDurationMs: 10 });
    const registry = createRegistry(sessionFactory, undefined, {
      turnContextForMessage: () => ({
        agentId: "shrimpy",
        channel: "telegram~shrimpy~1",
        sessionType: "gateway",
        capturedAt: "Wed, 04/29/2026, 12:00 AM EDT",
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
      /^<context>\n\[turn-context\]/,
    );
    assert.match(
      sessionFactory.sessions[0].prompts[0],
      /prior thing happened[\s\S]*<\/context>\n\n\[channel: telegram~shrimpy~1, sender: human:alice\]\nhello/,
    );
    assert.doesNotMatch(sessionFactory.sessions[0].prompts[0], /\[incoming\]/);
  });

  test("renders turn context text from structured data", () => {
    const text = renderTurnContext({
      agentId: "shrimpy",
      channel: "telegram~shrimpy~1",
      sessionType: "gateway",
      capturedAt: "Wed, 04/29/2026, 12:00 AM EDT",
      maxChars: 2000,
      items: [{
        id: "test",
        summary: "prior thing happened",
        inspect: "shrimpy channels read telegram~shrimpy~1",
      }],
    });

    assert.equal(text, [
      "[turn-context]",
      "time: Wed, 04/29/2026, 12:00 AM EDT",
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
