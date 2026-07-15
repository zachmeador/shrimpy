import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const projectRoot = process.cwd();

test("TUI launch limits private compatibility to four named UX seams", () => {
  const interactive = read("src/tui/interactive.ts");
  const installers = [...interactive.matchAll(/installShrimpy\w+/gu)]
    .map((match) => match[0]);
  assert.deepEqual([...new Set(installers)], [
    "installShrimpyInlineCommands",
    "installShrimpyModelSelectionGuard",
    "installShrimpySettingsSelector",
    "installShrimpyTurnContextRendering",
  ]);

  const settings = read("src/tui/shrimpy-settings.ts");
  assert.match(settings, /showSettingsSelector/);
  assert.match(settings, /showSelector/);
  assert.doesNotMatch(settings, /themeController|chatContainer|footer/);

  const inlineCommands = read("src/tui/shrimpy-inline-commands.ts");
  assert.match(inlineCommands, /setupEditorSubmitHandler/);
  assert.match(inlineCommands, /handleChangelogCommand/);
  assert.doesNotMatch(
    inlineCommands,
    /handleClearCommand|renderTool|contextRenderer|ThinkingSelectorComponent/,
  );

  const modelSelection = read("src/tui/shrimpy-model-selection.ts");
  assert.match(modelSelection, /showModelSelector/);
  assert.match(modelSelection, /createBaseAutocompleteProvider/);
  assert.match(modelSelection, /modelFavorites/);

  const turnContext = read("src/tui/shrimpy-turn-context-rendering.ts");
  assert.match(turnContext, /CustomMessageComponent\.prototype/);
  assert.match(turnContext, /TURN_CONTEXT_CUSTOM_TYPE/);

  for (const path of [
    "src/tui/shrimpy-activity-indicator.ts",
    "src/tui/shrimpy-command-surface.ts",
    "src/tui/shrimpy-context-rendering.ts",
    "src/tui/shrimpy-tool-rendering.ts",
  ]) {
    assert.equal(existsSync(join(projectRoot, path)), false, `${path} should stay deleted`);
  }
});

test("remaining Pi deep imports are limited to named non-InteractiveMode gaps", () => {
  const internals = read("src/app/pi-internals.ts");
  const paths = [...internals.matchAll(/from "([^"]+\/dist\/[^"]+)"/gu)]
    .map((match) => match[1]);
  assert.deepEqual(paths, [
    "../../node_modules/@earendil-works/pi-coding-agent/dist/core/provider-display-names.js",
    "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js",
  ]);
  assert.doesNotMatch(internals, /thinking-selector|interactive-mode/);
});

function read(path: string): string {
  return readFileSync(join(projectRoot, path), "utf-8");
}
