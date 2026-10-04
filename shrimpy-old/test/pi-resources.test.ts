import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  InteractiveMode,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createShrimpyResourceLoader } from "../dist/sessions/pi-resources.js";

test("Shrimpy's configured Pi extensions load without built-in command conflicts", async () => {
  const root = mkdtempSync(join(tmpdir(), "shrimpy-pi-resources-"));
  const modelRuntime = await ModelRuntime.create({
    authPath: join(root, "auth.json"),
    modelsPath: join(root, "models.json"),
    modelsStorePath: join(root, "models-store.json"),
    allowModelNetwork: false,
  });
  const loader = createShrimpyResourceLoader({
    cwd: root,
    settingsManager: SettingsManager.create(root, join(root, ".pi")),
    modelRuntime,
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
      "compact-tools.ts",
      "model-switch-renderer.ts",
    ],
  );
  assert.equal(
    result.extensions.some((extension) => extension.path.startsWith("<inline:")),
    true,
  );

  const commands = result.extensions.flatMap((extension) =>
    Array.from(extension.commands.values(), (command) => ({
      ...command,
      invocationName: command.name,
    }))
  );
  const conflictProbe = InteractiveMode.prototype as unknown as {
    getBuiltInCommandConflictDiagnostics(runner: {
      getRegisteredCommands(): typeof commands;
    }): Array<{ type: string; message: string; path?: string }>;
  };
  assert.deepEqual(
    conflictProbe.getBuiltInCommandConflictDiagnostics({
      getRegisteredCommands: () => commands,
    }),
    [],
  );
});
