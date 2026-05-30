import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initTheme,
  type InteractiveMode,
} from "@earendil-works/pi-coding-agent";
import { installShrimpySettingsSelector } from "../dist/tui/shrimpy-settings.js";
import type { ShrimpySettingsSelectorOptions } from "../dist/tui/shrimpy-settings.js";

test("Shrimpy interactive mode installs a unified settings selector", () => {
  initTheme("dark");
  let selectorFactory:
    | ((done: () => void) => { component: { render(width: number): string[] }; focus: unknown })
    | undefined;

  const interactive = {
    showSelector(create: NonNullable<typeof selectorFactory>): void {
      selectorFactory = create;
    },
  } as unknown as InteractiveMode & { showSettingsSelector(): void };

  installShrimpySettingsSelector(interactive, {
    runtime: {
      paths: {
        primaryConfigPath: "/tmp/shrimpy/config/shrimpy.json",
      },
    },
    agentId: "shrimpy",
    channel: "tui",
    sessionType: "tui",
    cwd: "/tmp/project",
  } as unknown as ShrimpySettingsSelectorOptions);

  assert.equal(typeof interactive.showSettingsSelector, "function");
  interactive.showSettingsSelector();
  assert.ok(selectorFactory);

  const { component, focus } = selectorFactory(() => {});
  const output = component.render(80).join("\n");

  assert.ok(focus);
  assert.match(output, /Shrimpy settings/);
  assert.match(output, /Pi settings/);
  assert.match(output, /interactive mode/);
});
