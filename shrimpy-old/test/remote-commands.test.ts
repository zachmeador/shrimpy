import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  executeRemoteCommand,
  type RemoteCommandContext,
  type RemoteCommandStatusDetails,
} from "../dist/surfaces/shared/remote-commands.js";

const IDLE_STATUS: RemoteCommandStatusDetails = {
  lane: {
    phase: "idle",
    queueDepth: 0,
  },
};

function context(
  overrides?: Partial<RemoteCommandContext>,
): RemoteCommandContext {
  return {
    surfaceId: "telegram.main",
    threadId: "4242",
    channel: "telegram~main~4242",
    targetAgentId: "shrimpy",
    defaultAgentId: "shrimpy",
    sender: {
      kind: "human",
      actorId: "human:alice",
      userId: "alice",
      displayName: "Alice",
    },
    origin: {
      transport: "telegram",
      transportUserId: "7",
      transportChatId: "4242",
    },
    permission: "full",
    supportedCommands: ["new", "clear", "stop", "thinking", "status", "help"],
    ...overrides,
  };
}

describe("executeRemoteCommand", () => {
  test("fails closed before status collection for permission none", async () => {
    let collected = false;
    const result = await executeRemoteCommand({
      readStatus: () => {
        collected = true;
        return IDLE_STATUS;
      },
    }, context({ permission: "none" }), { name: "status" });

    assert.deepEqual(result, {
      kind: "reply",
      reply: { kind: "unauthorized" },
    });
    assert.equal(collected, false);
  });

  test("fails closed when stable authenticated identity is missing", async () => {
    const result = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context({
      sender: {
        kind: "human",
        actorId: "human:anonymous",
      },
    }), { name: "help" });

    assert.deepEqual(result, {
      kind: "reply",
      reply: { kind: "unauthorized" },
    });
  });

  test("filters help by effective permission and adapter support", async () => {
    const result = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context({
      permission: "read-only",
      supportedCommands: ["new", "status", "help"],
    }), { name: "help" });

    assert.equal(result.kind, "reply");
    assert.equal(result.kind === "reply" && result.reply.kind, "help");
    if (result.kind !== "reply" || result.reply.kind !== "help") return;
    assert.deepEqual(
      result.reply.commands.map((command) => command.name),
      ["status", "help"],
    );
  });

  test("does not allow read-only callers to publish state-changing controls", async () => {
    const result = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context({ permission: "read-only" }), { name: "new" });

    assert.deepEqual(result, {
      kind: "reply",
      reply: { kind: "unauthorized" },
    });
  });

  test("returns typed controls with the authorized target and requester provenance", async () => {
    const result = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context({ targetAgentId: "career" }), { name: "clear" });

    assert.equal(result.kind, "control");
    if (result.kind !== "control") return;
    assert.equal(result.message.channel, "telegram~main~4242");
    assert.equal(result.message.sender.actorId, "human:alice");
    assert.equal(result.message.sender.userId, "alice");
    assert.deepEqual(result.message.origin, {
      transport: "telegram",
      transportUserId: "7",
      transportChatId: "4242",
      sourceChannel: "telegram~main~4242",
    });
    assert.deepEqual(result.message.content, {
      type: "control",
      data: {
        kind: "session_reset",
        targetAgentId: "career",
        command: "/clear",
      },
    });
  });

  test("enforces exact no-argument command grammar", async () => {
    const result = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context(), { name: "stop", rawArgs: "now" });

    assert.deepEqual(result, {
      kind: "reply",
      reply: {
        kind: "usage",
        command: "stop",
        usage: "/stop",
      },
    });
  });

  test("accepts exactly one canonical thinking level", async () => {
    const accepted = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context(), { name: "thinking", rawArgs: "high" });
    assert.equal(accepted.kind, "control");
    if (accepted.kind === "control") {
      assert.deepEqual(accepted.message.content, {
        type: "control",
        data: {
          kind: "session_thinking_level",
          targetAgentId: "shrimpy",
          level: "high",
          command: "/thinking",
        },
      });
    }

    const extra = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context(), { name: "thinking", rawArgs: "high now" });
    assert.equal(extra.kind, "reply");
    assert.equal(extra.kind === "reply" && extra.reply.kind, "usage");

    const alias = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context(), { name: "thinking", rawArgs: "on" });
    assert.equal(alias.kind, "reply");
    assert.equal(alias.kind === "reply" && alias.reply.kind, "usage");
  });

  test("consumes unknown and adapter-unsupported commands", async () => {
    const unknown = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context(), { name: "restore" });
    assert.deepEqual(unknown, {
      kind: "reply",
      reply: { kind: "unknown" },
    });

    const unsupported = await executeRemoteCommand({
      readStatus: () => IDLE_STATUS,
    }, context({ supportedCommands: ["help"] }), { name: "status" });
    assert.deepEqual(unsupported, {
      kind: "reply",
      reply: { kind: "unknown" },
    });
  });

  test("collects status only after authorization and grammar validation", async () => {
    let collections = 0;
    const deps = {
      readStatus: () => {
        collections += 1;
        return IDLE_STATUS;
      },
    };

    const invalid = await executeRemoteCommand(
      deps,
      context(),
      { name: "status", rawArgs: "extra" },
    );
    assert.equal(invalid.kind === "reply" && invalid.reply.kind, "usage");
    assert.equal(collections, 0);

    const valid = await executeRemoteCommand(deps, context(), { name: "status" });
    assert.equal(valid.kind === "reply" && valid.reply.kind, "status");
    assert.equal(collections, 1);
  });
});
