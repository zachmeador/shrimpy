import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAppRuntime } from "../dist/app/index.js";
import { ChannelBus } from "../dist/channels/bus.js";
import { readOperationStatusContent } from "../dist/channels/messages.js";
import { SessionControlRuntime } from "../dist/gateway/session-control-runtime.js";
import {
  executeSessionLifecycleAction,
  executeSessionStopAction,
  executeSessionThinkingAction,
} from "../dist/sessions/control.js";
import { createChannelSessionKey } from "../dist/sessions/identity.js";
import { acquireSessionLease } from "../dist/sessions/ownership.js";
import { createSessionDescriptor } from "../dist/sessions/spec.js";
import {
  archiveActiveSession,
} from "../dist/sessions/transcript-store.js";
import {
  ensureSessionManifest,
} from "../dist/sessions/manifest.js";
import {
  makeTempWorkspace,
  removeTempWorkspace,
  setupInit,
} from "./helpers.ts";

let workspace: string;

beforeEach(() => {
  workspace = makeTempWorkspace("shrimpy-session-control-test-");
  setupInit(workspace);
});

afterEach(() => {
  removeTempWorkspace(workspace);
});

describe("verified session control", () => {
  test("confirms a reset and verifies the archived session on disk", async () => {
    const runtime = createAppRuntime({ workspace });
    const bus = new ChannelBus(join(workspace, "channels"));
    const { descriptor, sessionDir } = channelSession("home");
    const lease = acquireSessionLease({ workspace, descriptor, kind: "gateway" });
    assert.ok(lease);
    mkdirSync(sessionDir, { recursive: true });
    const activePath = join(sessionDir, "home-active.jsonl");
    writeFileSync(activePath, `${JSON.stringify({
      type: "session",
      version: 3,
      id: "home-active",
      timestamp: new Date().toISOString(),
      cwd: workspace,
    })}\n`, "utf-8");
    let published = false;

    const result = await executeSessionLifecycleAction(runtime, {
      action: "new",
      sessionId: "channel/home",
    }, {
      pollIntervalMs: 1,
      timeoutMs: 100,
      sleep: async () => {
        if (published) return;
        published = true;
        const request = bus.read("home").messages.find((message) =>
          message.content.type === "control"
        );
        assert.ok(request);
        const archivedTo = archiveActiveSession(sessionDir);
        assert.equal(archivedTo, activePath);
        bus.publishStatus({
          channel: "home",
          actorId: "system:session-control",
          transport: "internal",
          data: {
            kind: "operation_status",
            text: "Started a new session for shrimpy.",
            ok: true,
            operation: "reset",
            targetAgentId: "shrimpy",
            requestMessageId: request.id,
            archiveName: "home-active.jsonl",
          },
        });
      },
    });

    assert.equal(result.outcome, "applied");
    assert.equal(result.archiveName, "home-active.jsonl");
    assert.match(result.message ?? "", /Started a new session/i);
    lease.release();
  });

  test("waits for the correlated status and ignores unrelated statuses", async () => {
    const runtime = createAppRuntime({ workspace });
    const bus = new ChannelBus(join(workspace, "channels"));
    const { descriptor } = channelSession("home");
    const lease = acquireSessionLease({ workspace, descriptor, kind: "gateway" });
    assert.ok(lease);
    let published = false;

    const result = await executeSessionThinkingAction(runtime, {
      sessionId: "channel/home",
      level: "high",
    }, {
      pollIntervalMs: 1,
      timeoutMs: 100,
      sleep: async () => {
        if (published) return;
        published = true;
        const request = bus.read("home").messages.find((message) =>
          message.content.type === "control"
        );
        assert.ok(request);
        bus.publishStatus({
          channel: "home",
          actorId: "system:session-control",
          transport: "internal",
          data: {
            kind: "operation_status",
            text: "Unrelated status.",
            ok: true,
            requestMessageId: "another-request",
          },
        });
        bus.publishStatus({
          channel: "home",
          actorId: "system:session-control",
          transport: "internal",
          data: {
            kind: "operation_status",
            text: "Set thinking level for shrimpy to high.",
            ok: true,
            operation: "thinking",
            targetAgentId: "shrimpy",
            requestMessageId: request.id,
          },
        });
      },
    });

    assert.equal(result.outcome, "applied");
    assert.equal(result.requestMessageId?.length > 0, true);
    assert.equal(result.message, "Set thinking level for shrimpy to high.");
    lease.release();
  });

  test("returns the gateway failure for a correlated request", async () => {
    const runtime = createAppRuntime({ workspace });
    const bus = new ChannelBus(join(workspace, "channels"));
    const { descriptor } = channelSession("home");
    const lease = acquireSessionLease({ workspace, descriptor, kind: "gateway" });
    assert.ok(lease);
    let published = false;

    const result = await executeSessionStopAction(runtime, {
      sessionId: "channel/home",
    }, {
      pollIntervalMs: 1,
      timeoutMs: 100,
      sleep: async () => {
        if (published) return;
        published = true;
        const request = bus.read("home").messages.find((message) =>
          message.content.type === "control"
        );
        assert.ok(request);
        bus.publishStatus({
          channel: "home",
          actorId: "system:session-control",
          transport: "internal",
          data: {
            kind: "operation_status",
            text: "Failed to stop the running turn for shrimpy: boom.",
            ok: false,
            operation: "stop",
            targetAgentId: "shrimpy",
            requestMessageId: request.id,
          },
        });
      },
    });

    assert.equal(result.outcome, "failed");
    assert.match(result.message ?? "", /boom/);
    lease.release();
  });

  test("reports an unconfirmed outcome after the timeout", async () => {
    const runtime = createAppRuntime({ workspace });
    const { descriptor } = channelSession("home");
    const lease = acquireSessionLease({ workspace, descriptor, kind: "gateway" });
    assert.ok(lease);
    const result = await executeSessionStopAction(runtime, {
      sessionId: "channel/home",
    }, {
      pollIntervalMs: 1,
      timeoutMs: 5,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    });

    assert.equal(result.outcome, "unconfirmed");
    assert.match(result.message ?? "", /not confirmed/);
    lease.release();
  });

  test("supports explicit fire-and-forget with a queued outcome", async () => {
    const runtime = createAppRuntime({ workspace });
    const { descriptor } = channelSession("home");
    const lease = acquireSessionLease({ workspace, descriptor, kind: "gateway" });
    assert.ok(lease);
    const result = await executeSessionStopAction(runtime, {
      sessionId: "channel/home",
      wait: false,
    });

    assert.equal(result.outcome, "queued");
    assert.equal(result.sessionId, "channel/home");
    assert.equal(new ChannelBus(join(workspace, "channels")).read("home").messages.length, 1);
    lease.release();
  });
});

function channelSession(channel: string) {
  const descriptor = createSessionDescriptor({
    agentRoot: join(workspace, "agents", "shrimpy"),
    key: createChannelSessionKey({ agentId: "shrimpy", channel }),
    purpose: "channel",
    delivery: { kind: "channel", channel },
  });
  ensureSessionManifest(descriptor);
  assert.equal(descriptor.storage.kind, "durable");
  return { descriptor, sessionDir: descriptor.storage.dir };
}

describe("SessionControlRuntime correlation", () => {
  test("publishes a correlated failure for an unknown target agent", async () => {
    const bus = new ChannelBus(join(workspace, "channels"));
    const runtime = new SessionControlRuntime(bus, new Map());
    const request = bus.publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:test" },
      origin: { transport: "test" },
      content: {
        type: "control",
        data: {
          kind: "session_reset",
          targetAgentId: "missing",
          command: "/new",
        },
      },
    });

    assert.equal(await runtime.handleMessage("home", request, "live"), true);
    const statusMessage = bus.read("home").messages.at(-1);
    assert.ok(statusMessage);
    const status = readOperationStatusContent(statusMessage.content);
    assert.equal(status?.ok, false);
    assert.equal(status?.requestMessageId, request.id);
    assert.equal(status?.targetAgentId, "missing");
  });
});
