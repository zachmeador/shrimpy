import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import { createShrimpyResourceLoader } from "../dist/sessions/pi-resources.js";

test("Shrimpy's configured Pi extensions all load", async () => {
  const root = mkdtempSync(join(tmpdir(), "shrimpy-pi-resources-"));
  const loader = createShrimpyResourceLoader({
    cwd: root,
    settingsManager: SettingsManager.create(root, join(root, ".pi")),
    runtimeConfig: {
      noSkills: true,
      noPromptTemplates: true,
    },
    systemPrompt: "You are Shrimpy.",
  });

  await loader.reload();
  const result = loader.getExtensions();

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.extensions
      .filter((extension) => !extension.path.startsWith("<inline:"))
      .map((extension) => basename(extension.path)),
    [
      "activity-indicator.ts",
      "archive-new-session.ts",
      "compaction-bias.ts",
      "compact-tools.ts",
      "model-switch-renderer.ts",
      "thinking.ts",
    ],
  );
});
