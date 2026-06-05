import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import {
  initTheme,
  loadThemeFromPath,
  theme,
} from "../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { primeInteractiveThemeForSession } from "../dist/sessions/direct.js";

test("TUI sessions prime the configured theme before Pi builds interactive components", () => {
  const shrimpyTheme = loadThemeFromPath(
    join(process.cwd(), "themes", "shrimpy.json"),
  );

  initTheme("dark", false);
  assert.notEqual(theme.fg("accent", "x"), shrimpyTheme.fg("accent", "x"));

  primeInteractiveThemeForSession({
    resourceLoader: {
      getThemes: () => ({ themes: [shrimpyTheme], diagnostics: [] }),
    },
    settingsManager: SettingsManager.inMemory({ theme: "shrimpy" }),
  } as Parameters<typeof primeInteractiveThemeForSession>[0]);

  assert.equal(theme.fg("accent", "x"), shrimpyTheme.fg("accent", "x"));
});
