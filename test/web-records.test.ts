import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  classifyChannelRecord,
  classifySessionRecord,
  splitInjectedMessageText,
} from "../web/src/lib/records.ts";

const turnInstruction =
  "The turn context above is background for the user message below. Answer the user message below using this context when relevant.";

describe("web record classification", () => {
  test("folds direct-session turn-context custom messages as noise", () => {
    const classified = classifySessionRecord({
      type: "custom_message",
      customType: "shrimpy_turn_context",
      content: "model-facing duplicate",
      details: { text: "[turn-context]\nprepared context" },
    });

    assert.equal(classified.foldClass, "noise");
    assert.equal(classified.label, "shrimpy_turn_context");
    assert.equal(classified.body, "[turn-context]\nprepared context");
  });

  test("classifies tool-result messages without duplicating their content", () => {
    const classified = classifySessionRecord({
      type: "message",
      message: {
        role: "toolResult",
        toolName: "read",
        content: [{ type: "text", text: "one result body" }],
      },
    });

    assert.equal(classified.foldClass, "tool");
    assert.equal(classified.body, "one result body");
    assert.equal(classified.body.match(/one result body/g)?.length, 1);
  });

  test("separates a generated channel preamble from the human message", () => {
    const text = [
      "[turn-context]",
      "agent: shrimpy",
      "",
      "This is a channel turn. Use a publication tool for every user-visible message.",
      "",
      turnInstruction,
      "",
      "[channel: home, sender: human:alice, addressed_agent: shrimpy]",
      "please check the tide",
    ].join("\n");

    const split = splitInjectedMessageText(text);
    assert.ok(split);
    assert.equal(split.context.foldClass, "noise");
    assert.equal(split.context.label, "context");
    assert.match(split.context.body, /sender: human:alice/);
    assert.equal(split.text, "please check the tide");

    const classified = classifySessionRecord({
      type: "message",
      message: { role: "user", content: [{ type: "text", text }] },
    });
    assert.equal(classified.foldClass, "content");
    assert.equal(classified.text, "please check the tide");
    assert.equal(classified.context?.label, "context");
  });

  test("folds unknown session events behind a bounded summary", () => {
    const classified = classifySessionRecord({
      type: "future_event",
      payload: { text: "x".repeat(1_000) },
    });

    assert.equal(classified.foldClass, "noise");
    assert.equal(classified.label, "future_event");
    assert.ok(classified.summary.length <= 120);
    assert.match(classified.body, /"payload"/);
  });

  test("folds unknown channel content as noise", () => {
    const classified = classifyChannelRecord({
      sender: { kind: "system", actorId: "system" },
      content: {
        type: "policy",
        data: { kind: "membership_changed", agentId: "mechanic" },
      },
    });

    assert.equal(classified.foldClass, "noise");
    assert.equal(classified.label, "membership_changed");
    assert.match(classified.body, /mechanic/);
  });

  test("never folds ordinary text that merely resembles context", () => {
    const text = "[turn-context]\nthis is user-authored and has no generated instruction";
    const classified = classifySessionRecord({
      type: "message",
      message: { role: "user", content: [{ type: "text", text }] },
    });

    assert.equal(classified.foldClass, "content");
    assert.equal(classified.context, undefined);
    assert.equal(classified.text, text);
  });
});
