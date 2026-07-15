import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CustomMessageComponent,
  getMarkdownTheme,
  initTheme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { TURN_CONTEXT_CUSTOM_TYPE } from "../dist/sessions/turn-context.js";
import { installShrimpyTurnContextRendering } from "../dist/tui/shrimpy-turn-context-rendering.js";

test("collapsed turn context takes zero transcript rows and Ctrl+O reveals it", () => {
  initTheme("dark", false);
  installShrimpyTurnContextRendering();
  const component = new CustomMessageComponent(
    {
      role: "custom",
      customType: TURN_CONTEXT_CUSTOM_TYPE,
      content: "model-visible context",
      display: true,
      details: { text: "model-visible context" },
      timestamp: Date.now(),
    } as never,
    (_message, { expanded }) => new Text(
      expanded ? "model-visible context" : "",
      0,
      0,
    ),
    getMarkdownTheme(),
  );

  assert.deepEqual(component.render(80), []);
  component.setExpanded(true);
  assert.match(component.render(80).join("\n"), /model-visible context/);
  component.setExpanded(false);
  assert.deepEqual(component.render(80), []);
});

test("the spacing patch does not suppress other custom messages", () => {
  initTheme("dark", false);
  installShrimpyTurnContextRendering();
  const component = new CustomMessageComponent({
    role: "custom",
    customType: "something_else",
    content: "visible custom message",
    display: true,
    timestamp: Date.now(),
  } as never, undefined, getMarkdownTheme());

  assert.match(component.render(80).join("\n"), /visible custom message/);
});
