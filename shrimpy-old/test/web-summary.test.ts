import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  summarizeChannel,
  summarizeNode,
  summarizeSession,
} from "../web/src/lib/summary.ts";
import {
  eventTimestamp,
  formatEventDay,
  formatEventTime,
  formatRelativeTime,
  tailPath,
} from "../web/src/lib/format.ts";

describe("web header summaries", () => {
  test("keeps path metadata to a trailing 50-character display", () => {
    const path = "agents/shrimpy/context/a-very-long-directory-name/another-directory/WORKSPACE.md";
    const displayed = tailPath(path);

    assert.equal(displayed.length, 50);
    assert.equal(displayed.startsWith("…"), true);
    assert.equal(path.endsWith(displayed.slice(1)), true);
    assert.equal(tailPath("runtime/gateway-state.json"), "runtime/gateway-state.json");
  });

  test("keeps relative tree times compact across useful ranges", () => {
    const now = Date.UTC(2026, 6, 27, 12);
    assert.equal(formatRelativeTime(0, now), "—");
    assert.equal(formatRelativeTime(now - 20_000, now), "now");
    assert.equal(formatRelativeTime(now - 5 * 60_000, now), "5m");
    assert.equal(formatRelativeTime(now - 3 * 3_600_000, now), "3h");
    assert.equal(formatRelativeTime(now - 8 * 86_400_000, now), "8d");
    assert.equal(formatRelativeTime(now - 65 * 86_400_000, now), "2mo");
  });

  test("uses one transcript time format with separate local day labels", () => {
    const timestamp = new Date(2026, 6, 27, 9, 8, 7, 654).getTime();
    assert.equal(formatEventTime(timestamp), "09:08:07");
    assert.equal(formatEventDay(timestamp), "2026-07-27");
    assert.equal(eventTimestamp({ timestamp }), timestamp);
    assert.equal(
      eventTimestamp({ message: { timestamp: "2026-07-27T13:08:07.654Z" } }),
      Date.parse("2026-07-27T13:08:07.654Z"),
    );
  });

  test("summarizes the loaded session range from current transcript records", () => {
    const summary = summarizeSession([
      {
        type: "session",
        timestamp: "2026-07-27T10:00:00.000Z",
      },
      {
        type: "custom",
        customType: "shrimpy_session_metadata",
        timestamp: "2026-07-27T10:01:00.000Z",
        data: {
          env: {
            provider: "openai",
            model_id: "gpt-5",
          },
        },
      },
      {
        type: "thinking_level_change",
        thinkingLevel: "high",
        timestamp: "2026-07-27T10:02:00.000Z",
      },
      {
        type: "message",
        timestamp: "2026-07-27T10:03:00.000Z",
        message: {
          role: "user",
          content: [{ type: "text", text: "hello" }],
        },
      },
      {
        type: "message",
        timestamp: "2026-07-27T10:04:00.000Z",
        message: {
          role: "assistant",
          provider: "openai",
          model: "gpt-5.1",
          content: [
            { type: "text", text: "checking" },
            { type: "toolCall", name: "read", arguments: {} },
          ],
          usage: { cost: { total: 0.0123 } },
        },
      },
      {
        type: "message",
        timestamp: "2026-07-27T10:05:00.000Z",
        message: {
          role: "toolResult",
          content: [{ type: "text", text: "done" }],
        },
      },
      {
        type: "custom",
        customType: "shrimpy_lifecycle",
        timestamp: "2026-07-27T10:06:00.000Z",
        data: { state: "archived" },
      },
    ], true);

    assert.equal(summary.partial, true);
    assert.deepEqual(
      Object.fromEntries(summary.items.map((item) => [item.label, item.value])),
      {
        model: "openai/gpt-5.1",
        thinking: "high",
        messages: "U1 A1 T1",
        tools: "1",
        cost: "$0.0123",
        span: "2026-07-27 10:00Z → 2026-07-27 10:06Z",
        state: "archived",
      },
    );
  });

  test("summarizes channel sender kinds and time span", () => {
    const summary = summarizeChannel([
      {
        timestamp: 1_753_610_400_000,
        sender: { kind: "human", actorId: "human:alice" },
      },
      {
        timestamp: 1_753_610_460_000,
        sender: { kind: "agent", actorId: "agent:shrimpy" },
      },
      {
        timestamp: 1_753_610_520_000,
        sender: { kind: "system", actorId: "system:watch" },
      },
    ]);

    assert.equal(summary.partial, false);
    assert.deepEqual(
      Object.fromEntries(summary.items.map((item) => [item.label, item.value])),
      {
        senders: "H1 A1 S1",
        span: "2025-07-27 10:00Z → 2025-07-27 10:02Z",
      },
    );
  });

  test("uses file metadata for text and runtime modification summaries", () => {
    const summary = summarizeNode({
      id: "runtime",
      label: "Gateway log",
      kind: "runtime",
      metadata: [{ label: "path", value: "runtime/logs/gateway.log" }],
      revision: "1",
      sourcePath: "runtime/logs/gateway.log",
      mtimeMs: Date.parse("2026-07-27T12:34:00.000Z"),
      mode: "text",
      text: "ready\n",
      truncated: false,
      totalSize: 6,
    });

    assert.deepEqual(summary.items, [{
      label: "modified",
      value: "2026-07-27 12:34Z",
      title: "2026-07-27T12:34:00.000Z",
    }]);
  });
});
