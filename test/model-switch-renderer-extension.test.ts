import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initTheme,
  type MessageRenderer,
} from "@earendil-works/pi-coding-agent";
import modelSwitchRendererExtension from "../extensions/model-switch-renderer.ts";

test("model switch renderer shows compact current model label when collapsed", () => {
  initTheme("dark", false);
  const renderer = registerModelSwitchRenderer();

  const rendered = stripAnsi(renderComponent(renderer({
    role: "custom",
    customType: "shrimpy_model_switch",
    content: "[session runtime] Model switched: old_provider/old-model -> new_provider/new-model. Thinking: off. Earlier assistant messages may be from old_provider/old-model.",
    display: true,
    details: {
      current: {
        provider: "new_provider",
        id: "new-model",
      },
    },
    timestamp: 1,
  }, { expanded: false }, testTheme())));

  assert.match(rendered, /Model: new-model/);
  assert.doesNotMatch(rendered, /session runtime/);
});

test("model switch renderer shows exact runtime message when expanded", () => {
  initTheme("dark", false);
  const renderer = registerModelSwitchRenderer();
  const content = "[session runtime] Model switched: old_provider/old-model -> new_provider/new-model. Thinking: off. Earlier assistant messages may be from old_provider/old-model.";

  const rendered = stripAnsi(renderComponent(renderer({
    role: "custom",
    customType: "shrimpy_model_switch",
    content,
    display: true,
    details: {
      current: {
        provider: "new_provider",
        id: "new-model",
      },
    },
    timestamp: 1,
  }, { expanded: true }, testTheme())));

  assert.match(rendered, /\[shrimpy_model_switch\]/);
  assert.match(normalizeRenderedText(rendered), new RegExp(escapeRegExp(content)));
});

test("model switch renderer falls back to message content for collapsed label", () => {
  initTheme("dark", false);
  const renderer = registerModelSwitchRenderer();

  const rendered = stripAnsi(renderComponent(renderer({
    role: "custom",
    customType: "shrimpy_model_switch",
    content: "[session runtime] Model switched: no active model -> provider/model-from-content. Earlier assistant messages may be from no active model.",
    display: true,
    timestamp: 1,
  }, { expanded: false }, testTheme())));

  assert.match(rendered, /Model: provider\/model-from-content/);
});

function registerModelSwitchRenderer(): MessageRenderer {
  let renderer: MessageRenderer | undefined;
  modelSwitchRendererExtension({
    registerMessageRenderer(_customType: string, next: MessageRenderer): void {
      renderer = next;
    },
  } as never);
  assert.ok(renderer);
  return renderer;
}

function testTheme() {
  return {
    fg(_color: string, text: string): string {
      return text;
    },
  } as never;
}

function renderComponent(component: ReturnType<MessageRenderer<unknown>>): string {
  assert.ok(component);
  return component.render(120).join("\n");
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/gu, "");
}

function normalizeRenderedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
