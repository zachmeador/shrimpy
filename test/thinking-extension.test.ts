import { describe, test } from "node:test";
import assert from "node:assert/strict";
import thinkingExtension from "../extensions/thinking.ts";

describe("thinking extension", () => {
  test("registers a /thinking command that updates the session level", async () => {
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
    const notifications: Array<{ text: string; level: string }> = [];
    let thinkingLevel = "medium";
    let waited = false;

    thinkingExtension({
      registerCommand(name: string, options: any) {
        assert.equal(name, "thinking");
        handler = options.handler;
      },
      getThinkingLevel() {
        return thinkingLevel;
      },
      setThinkingLevel(level: string) {
        thinkingLevel = level;
      },
    } as any);

    assert.ok(handler);
    await handler!("high", {
      waitForIdle: async () => {
        waited = true;
      },
      ui: {
        notify(text: string, level: string) {
          notifications.push({ text, level });
        },
      },
    });

    assert.equal(waited, true);
    assert.equal(thinkingLevel, "high");
    assert.deepEqual(notifications, [{
      text: "Thinking set to high",
      level: "info",
    }]);
  });

  test("reports usage when invoked without a level", async () => {
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
    const notifications: Array<{ text: string; level: string }> = [];

    thinkingExtension({
      registerCommand(_name: string, options: any) {
        handler = options.handler;
      },
      getThinkingLevel() {
        return "low";
      },
      setThinkingLevel() {
        throw new Error("should not be called");
      },
    } as any);

    assert.ok(handler);
    await handler!("   ", {
      waitForIdle: async () => {},
      ui: {
        notify(text: string, level: string) {
          notifications.push({ text, level });
        },
      },
    });

    assert.deepEqual(notifications, [{
      text: "Usage: /thinking <level> (off, minimal, low, medium, high, xhigh, max, on (= medium)); current low",
      level: "info",
    }]);
  });

  test("maps /thinking on to medium", async () => {
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
    const notifications: Array<{ text: string; level: string }> = [];
    let thinkingLevel = "off";

    thinkingExtension({
      registerCommand(_name: string, options: any) {
        handler = options.handler;
      },
      getThinkingLevel() {
        return thinkingLevel;
      },
      setThinkingLevel(level: string) {
        thinkingLevel = level;
      },
    } as any);

    assert.ok(handler);
    await handler!("on", {
      waitForIdle: async () => {},
      ui: {
        notify(text: string, level: string) {
          notifications.push({ text, level });
        },
      },
    });

    assert.equal(thinkingLevel, "medium");
    assert.deepEqual(notifications, [{
      text: "Thinking set to medium (requested on)",
      level: "info",
    }]);
  });
});
