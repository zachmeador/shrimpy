import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createAppRuntime } from "../dist/app/runtime.js";
import {
  describeSessionActivity,
} from "../dist/context/turn/activity.js";
import { buildTurnContext } from "../dist/context/turn/builder.js";
import {
  markTurnContextDelivered,
} from "../dist/context/turn/delivery.js";
import { renderTurnContext } from "../dist/context/turn/render.js";
import {
  appendAgentActivity,
  readContextState,
} from "../dist/context/turn/state.js";
import {
  createChannelSessionKey,
  createLocalSessionKey,
} from "../dist/sessions/identity.js";
import {
  createSessionDescriptor,
} from "../dist/sessions/spec.js";
import {
  createSessionRecordingExtensionFactory,
} from "../dist/sessions/recording.js";
import { textContent } from "../dist/channels/messages.js";

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "shrimpy-context-activity-"));
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("session activity descriptions", () => {
  test("keeps exact short outbound excerpts, direct replies, and other tool names", () => {
    const entries = describeSessionActivity(
      localDescriptor("source"),
      [{
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "send-1",
            name: "send_message",
            arguments: {
              channel: "dm~helper~shrimpy",
              text: "Check the gateway cursor.",
            },
          },
          {
            type: "toolCall",
            id: "edit-1",
            name: "edit",
            arguments: { path: "src/example.ts" },
          },
          { type: "text", text: "I sent the request and updated the local plan." },
        ],
        timestamp: Date.now(),
      } as any],
      "pi-source",
    );

    assert.deepEqual(entries.map((entry) => entry.summary), [
      "sent to dm~helper~shrimpy: “Check the gateway cursor.”",
      "said: “I sent the request and updated the local plan.”",
      "used tools: edit",
    ]);
    assert.match(entries[0]!.inspect, /sessions list local\/source --agent shrimpy/);
    assert.equal(entries[0]!.sessionId, "pi-source");
    assert.equal(entries[0]!.sessionLabel, "local/source");
  });

  test("records active-channel publications instead of private channel assistant text", () => {
    const entries = describeSessionActivity(
      channelDescriptor("home"),
      [{
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "reply-1",
            name: "reply",
            arguments: { text: "Visible reply." },
          },
          { type: "text", text: "private channel text" },
        ],
        timestamp: Date.now(),
      } as any],
      "pi-channel-home",
    );

    assert.deepEqual(entries.map((entry) => entry.summary), [
      "published reply in home: “Visible reply.”",
    ]);
  });

  test("records activity only after the session run settles", () => {
    const handlers = new Map<string, (event: any) => void>();
    const factory = createSessionRecordingExtensionFactory({
      sessionManager: {
        getSessionId: () => "pi-source",
      } as any,
      bootstrap: {
        workspacePath: workspace,
      } as any,
      plan: {
        descriptor: localDescriptor("source"),
      } as any,
      envKeys: [],
      env: {},
      compaction: {} as any,
    });
    factory({
      on(event: string, handler: (event: any) => void) {
        handlers.set(event, handler);
      },
    } as any);

    handlers.get("agent_end")?.({
      messages: [{
        role: "assistant",
        content: [{ type: "text", text: "Settled result." }],
        timestamp: Date.now(),
      }],
    });
    const runtime = createAppRuntime({ workspace });
    assert.deepEqual(readContextState(runtime, "shrimpy").activity, []);

    handlers.get("agent_settled")?.({ type: "agent_settled" });
    assert.deepEqual(
      readContextState(runtime, "shrimpy").activity.map((entry) => entry.summary),
      ["said: “Settled result.”"],
    );
  });
});

describe("per-session unseen context", () => {
  test("delivers other-session activity once per independent receiving session", async () => {
    const runtime = createAppRuntime({ workspace });
    appendAgentActivity(workspace, "shrimpy", [{
      sessionId: "pi-source",
      sessionLabel: "local/source",
      at: new Date().toISOString(),
      summary: "said: “Elsewhere.”",
      inspect: "shrimpy sessions list local/source --agent shrimpy",
    }]);

    const firstDescriptor = localDescriptor("first");
    const first = await buildTurnContext({
      runtime,
      descriptor: firstDescriptor,
      sessionInstanceId: "pi-first",
    });
    assert.match(activitySummary(first), /recent activity from local\/source/);
    markTurnContextDelivered(runtime, first);

    const repeated = await buildTurnContext({
      runtime,
      descriptor: firstDescriptor,
      sessionInstanceId: "pi-first",
    });
    assert.equal(activitySummary(repeated), "");

    const second = await buildTurnContext({
      runtime,
      descriptor: localDescriptor("second"),
      sessionInstanceId: "pi-second",
    });
    assert.match(activitySummary(second), /recent activity from local\/source/);

    const source = await buildTurnContext({
      runtime,
      descriptor: localDescriptor("source"),
      sessionInstanceId: "pi-source",
    });
    assert.equal(activitySummary(source), "");
  });

  test("a new transcript gets fresh delivery state under the same canonical session", async () => {
    const runtime = createAppRuntime({ workspace });
    appendAgentActivity(workspace, "shrimpy", [{
      sessionId: "pi-source",
      sessionLabel: "local/source",
      at: new Date().toISOString(),
      summary: "said: “Carry this across.”",
      inspect: "shrimpy sessions list local/source --agent shrimpy",
    }]);
    const target = localDescriptor("main");

    const original = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main-before-reset",
    });
    markTurnContextDelivered(runtime, original);
    const repeated = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main-before-reset",
    });
    assert.equal(activitySummary(repeated), "");

    const resetTranscript = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main-after-reset",
    });
    assert.match(activitySummary(resetTranscript), /Carry this across/);
  });

  test("suppresses unchanged facts and emits them again after the fact changes", async () => {
    const runtime = createAppRuntime({ workspace });
    const bus = runtime.createChannelBus();
    bus.publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user" },
      origin: { transport: "cli" },
      content: textContent("first"),
    });
    const target = localDescriptor("main");

    const first = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main",
    });
    assert.ok(first.items.some((item) => item.id === "gateway:status"));
    markTurnContextDelivered(runtime, first);

    const repeated = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main",
    });
    assert.equal(
      repeated.items.some((item) => item.id === "gateway:status"),
      false,
    );

    bus.publish({
      channel: "home",
      sender: { kind: "human", actorId: "human:user" },
      origin: { transport: "cli" },
      content: textContent("second"),
    });
    const changed = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main",
    });
    assert.ok(changed.items.some((item) => item.id === "gateway:status"));
  });

  test("preview does not consume delivery state", async () => {
    const runtime = createAppRuntime({ workspace });
    appendAgentActivity(workspace, "shrimpy", [{
      sessionId: "pi-source",
      sessionLabel: "local/source",
      at: new Date().toISOString(),
      summary: "said: “Preview me.”",
      inspect: "shrimpy sessions list local/source --agent shrimpy",
    }]);
    const target = localDescriptor("main");

    const preview = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main",
      preview: true,
    });
    assert.match(activitySummary(preview), /Preview me/);
    assert.deepEqual(readContextState(runtime, "shrimpy").sessions, {});

    const live = await buildTurnContext({
      runtime,
      descriptor: target,
      sessionInstanceId: "pi-main",
    });
    assert.match(activitySummary(live), /Preview me/);
  });

  test("does not consume activity that the turn budget could not deliver", async () => {
    const smallRuntime = createAppRuntime({
      workspace,
      context: { turn: { maxChars: 120 } },
    });
    appendAgentActivity(workspace, "shrimpy", [{
      sessionId: "pi-source",
      sessionLabel: "local/source",
      at: new Date().toISOString(),
      summary: `said: “${"too large ".repeat(20)}”`,
      inspect: "shrimpy sessions list local/source --agent shrimpy",
    }]);
    const target = localDescriptor("main");

    const clipped = await buildTurnContext({
      runtime: smallRuntime,
      descriptor: target,
      sessionInstanceId: "pi-main",
    });
    assert.doesNotMatch(renderTurnContext(clipped), /recent activity/);
    markTurnContextDelivered(smallRuntime, clipped);

    const normalRuntime = createAppRuntime({ workspace });
    const retry = await buildTurnContext({
      runtime: normalRuntime,
      descriptor: target,
      sessionInstanceId: "pi-main",
    });
    assert.match(activitySummary(retry), /recent activity/);
  });

  test("locked activity updates preserve sequential entries", () => {
    const runtime = createAppRuntime({ workspace });
    appendAgentActivity(workspace, "shrimpy", [{
      sessionId: "pi-one",
      sessionLabel: "local/one",
      at: new Date().toISOString(),
      summary: "first",
      inspect: "inspect first",
    }]);
    appendAgentActivity(workspace, "shrimpy", [{
      sessionId: "pi-two",
      sessionLabel: "local/two",
      at: new Date().toISOString(),
      summary: "second",
      inspect: "inspect second",
    }]);

    const state = readContextState(runtime, "shrimpy");
    assert.deepEqual(state.activity.map((entry) => entry.sequence), [1, 2]);
    assert.equal(state.nextActivitySequence, 3);
  });
});

function localDescriptor(name: string) {
  return createSessionDescriptor({
    agentRoot: join(workspace, "agents", "shrimpy"),
    key: createLocalSessionKey({ agentId: "shrimpy", name }),
    purpose: "interactive",
    delivery: { kind: "transcript" },
  });
}

function channelDescriptor(channel: string) {
  return createSessionDescriptor({
    agentRoot: join(workspace, "agents", "shrimpy"),
    key: createChannelSessionKey({ agentId: "shrimpy", channel }),
    purpose: "channel",
    delivery: { kind: "channel", channel },
  });
}

function activitySummary(context: Awaited<ReturnType<typeof buildTurnContext>>): string {
  return context.items
    .filter((item) => item.id.startsWith("activity:"))
    .map((item) => item.summary)
    .join("\n");
}
