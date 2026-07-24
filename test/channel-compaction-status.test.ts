import { afterEach, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ChannelBus } from "../dist/channels/bus.js";
import { publishTerminalCompactionFailureStatus } from "../dist/sessions/compaction/channel-status.js";
import type { SessionCompactionEndEvent } from "../dist/sessions/compaction/events.js";

let testDir: string;

beforeEach(() => {
  testDir = mkdtempSync(join(tmpdir(), "shrimpy-compaction-status-test-"));
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function event(input: {
  errorMessage?: string;
  aborted?: boolean;
  willRetry?: boolean;
}): SessionCompactionEndEvent {
  return {
    type: "compaction_end",
    reason: "threshold",
    result: undefined,
    aborted: input.aborted ?? false,
    willRetry: input.willRetry ?? false,
    ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
  };
}

describe("channel compaction status", () => {
  test("publishes one typed status only for a terminal compaction failure", () => {
    const channel = "telegram~main~4242";
    const channelBus = new ChannelBus(join(testDir, "channels"));
    const publish = (input: Parameters<typeof event>[0]) =>
      publishTerminalCompactionFailureStatus({
        channelBus,
        channel,
        agentId: "shrimpy",
        event: event(input),
      });

    assert.equal(publish({}), null);
    assert.equal(
      publish({ errorMessage: "provider unavailable", willRetry: true }),
      null,
    );
    assert.equal(
      publish({ errorMessage: "cancelled", aborted: true }),
      null,
    );
    assert.equal(channelBus.read(channel).messages.length, 0);

    const message = publish({ errorMessage: "private provider payload" });

    assert.ok(message);
    assert.deepEqual(message.sender, {
      kind: "system",
      actorId: "system:compaction",
      userId: undefined,
      displayName: undefined,
    });
    assert.deepEqual(message.origin, {
      transport: "internal",
      sourceChannel: channel,
      transportUserId: undefined,
      transportChatId: undefined,
      addressedAgentId: undefined,
    });
    assert.deepEqual(message.content, {
      type: "status",
      data: {
        kind: "operation_status",
        operation: "compaction",
        ok: false,
        targetAgentId: "shrimpy",
        text: (
          "Compaction failed for shrimpy. If this keeps happening, inspect "
          + "`shrimpy sessions compaction channel/telegram~main~4242 --agent shrimpy` "
          + "and `shrimpy gateway logs`."
        ),
      },
    });
    assert.doesNotMatch(JSON.stringify(message), /private provider payload/);
    const stored = channelBus.read(channel).messages;
    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.id, message.id);
    assert.deepEqual(stored[0]?.content, message.content);
  });
});
