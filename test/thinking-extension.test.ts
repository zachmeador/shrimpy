import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { initTheme } from "@earendil-works/pi-coding-agent";
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
      mode: "print",
      waitForIdle: async () => {},
      ui: {
        notify(text: string, level: string) {
          notifications.push({ text, level });
        },
      },
    });

    assert.deepEqual(notifications, [{
      text: "Usage: /thinking <level> (off, minimal, low, medium, high, xhigh, max); current low",
      level: "info",
    }]);
  });

  test("opens Pi's public selector for bare /thinking in the TUI", async () => {
    initTheme("dark", false);
    let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
    let thinkingLevel = "low";
    let rendered = "";
    let waited = false;

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

    await handler!("", {
      mode: "tui",
      model: {
        provider: "test",
        id: "reasoning-model",
        reasoning: true,
        thinkingLevelMap: { xhigh: null, max: null },
      },
      waitForIdle: async () => {
        waited = true;
      },
      ui: {
        async custom(factory: Function) {
          let selected: string | undefined;
          const selector = factory({}, {}, {}, (level: string | undefined) => {
            selected = level;
          });
          rendered = selector.render(100).join("\n");
          selector.getSelectList().onSelect({ value: "high", label: "high" });
          return selected;
        },
        notify() {},
      },
    });

    assert.match(rendered, /Light reasoning/);
    assert.match(rendered, /Deep reasoning/);
    assert.doesNotMatch(rendered, /xhigh/);
    assert.equal(waited, false);
    assert.equal(thinkingLevel, "high");
  });

  test("rejects non-canonical thinking aliases", async () => {
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

    assert.equal(thinkingLevel, "off");
    assert.deepEqual(notifications, [{
      text: "Invalid thinking level \"on\". Use: off, minimal, low, medium, high, xhigh, max",
      level: "warning",
    }]);
  });
});
