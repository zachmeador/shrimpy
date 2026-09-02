import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveRuntimeConfig } from "../dist/config/runtime.js";
import { validateRawConfig } from "../dist/config/store.js";
import { createSessionSettingsManager } from "../dist/sessions/settings.js";

test("every native Pi preference persists through Shrimpy config", async () => {
  const workspace = createWorkspace();
  const ambientPath = join(workspace, ".pi", "settings.json");
  mkdirSync(join(workspace, ".pi"), { recursive: true });
  writeFileSync(ambientPath, JSON.stringify({ theme: "ambient" }));
  const runtimeConfig = resolveRuntimeConfig(readConfig(workspace).runtime);
  const settings = createManager(workspace, "alpha", runtimeConfig);

  settings.setCompactionEnabled(false);
  settings.setShowImages(false);
  settings.setImageWidthCells(120);
  settings.setImageAutoResize(false);
  settings.setBlockImages(true);
  settings.setEnableSkillCommands(false);
  settings.setSteeringMode("all");
  settings.setFollowUpMode("all");
  settings.setTransport("websocket");
  settings.setHttpIdleTimeoutMs(0);
  settings.setModelThinkingLevel("test", "reasoner", "high");
  settings.setTheme("dark");
  settings.setHideThinkingBlock(true);
  settings.setMermaidRenderingMode("streaming");
  settings.setShowCacheMissNotices(false);
  settings.setCollapseChangelog(false);
  settings.setEnableInstallTelemetry(false);
  settings.setQuietStartup(false);
  settings.setDefaultProjectTrust("never");
  settings.setDoubleEscapeAction("none");
  settings.setTreeFilterMode("user-only");
  settings.setShowHardwareCursor(true);
  settings.setEditorPaddingX(3);
  settings.setOutputPad(0);
  settings.setAutocompleteMaxVisible(15);
  settings.setClearOnShrink(true);
  settings.setShowTerminalProgress(false);
  settings.setTuiMode("fullscreen");
  settings.setFullscreenExitOutput("resume-hint");
  settings.setFullscreenScrollbar("always");
  settings.setFullscreenCopyOnSelect(false);
  settings.setWarnings({ anthropicExtraUsage: false });
  settings.setDefaultThinkingLevel("xhigh");
  await settings.flush();

  assert.deepEqual(settings.drainErrors(), []);
  assert.equal(readFileSync(ambientPath, "utf-8"), JSON.stringify({ theme: "ambient" }));

  const config = readConfig(workspace);
  assert.equal(config.runtime?.theme, "dark");
  assert.equal(config.runtime?.quietStartup, false);
  assert.equal(config.runtime?.compaction?.enabled, false);
  assert.equal(config.agents?.find((agent) => agent.id === "alpha")?.thinking, "xhigh");
  assert.equal(config.agents?.find((agent) => agent.id === "beta")?.thinking, "low");
  assert.equal(config.pi?.settings?.theme, undefined);
  assert.equal(config.pi?.settings?.quietStartup, undefined);
  assert.equal(config.pi?.settings?.compaction, undefined);
  assert.equal(config.pi?.settings?.defaultThinkingLevel, undefined);

  const restartedRuntime = resolveRuntimeConfig(config.runtime);
  const restarted = createManager(workspace, "alpha", restartedRuntime);
  assert.equal(restarted.getCompactionEnabled(), false);
  assert.equal(restarted.getShowImages(), false);
  assert.equal(restarted.getImageWidthCells(), 120);
  assert.equal(restarted.getImageAutoResize(), false);
  assert.equal(restarted.getBlockImages(), true);
  assert.equal(restarted.getEnableSkillCommands(), false);
  assert.equal(restarted.getSteeringMode(), "all");
  assert.equal(restarted.getFollowUpMode(), "all");
  assert.equal(restarted.getTransport(), "websocket");
  assert.equal(restarted.getHttpIdleTimeoutMs(), 0);
  assert.equal(restarted.getModelThinkingLevel("test", "reasoner"), "high");
  assert.equal(restarted.getThemeSetting(), "dark");
  assert.equal(restarted.getHideThinkingBlock(), true);
  assert.equal(restarted.getMermaidRenderingMode(), "streaming");
  assert.equal(restarted.getShowCacheMissNotices(), false);
  assert.equal(restarted.getCollapseChangelog(), false);
  assert.equal(restarted.getEnableInstallTelemetry(), false);
  assert.equal(restarted.getQuietStartup(), false);
  assert.equal(restarted.getDefaultProjectTrust(), "never");
  assert.equal(restarted.getDoubleEscapeAction(), "none");
  assert.equal(restarted.getTreeFilterMode(), "user-only");
  assert.equal(restarted.getShowHardwareCursor(), true);
  assert.equal(restarted.getEditorPaddingX(), 3);
  assert.equal(restarted.getOutputPad(), 0);
  assert.equal(restarted.getAutocompleteMaxVisible(), 15);
  assert.equal(restarted.getClearOnShrink(), true);
  assert.equal(restarted.getShowTerminalProgress(), false);
  assert.equal(restarted.getTuiMode(), "fullscreen");
  assert.equal(restarted.getFullscreenExitOutput(), "resume-hint");
  assert.equal(restarted.getFullscreenScrollbar(), "always");
  assert.equal(restarted.getFullscreenCopyOnSelect(), false);
  assert.deepEqual(restarted.getWarnings(), { anthropicExtraUsage: false });
  assert.equal(restarted.getDefaultThinkingLevel(), "xhigh");
  assert.equal(runtimeConfig.theme, "dark");
  assert.equal(runtimeConfig.quietStartup, false);
  assert.equal(runtimeConfig.compaction.enabled, false);
});

test("thinking defaults are isolated by agent and survive new managers", async () => {
  const workspace = createWorkspace();
  const alpha = createManager(
    workspace,
    "alpha",
    resolveRuntimeConfig(readConfig(workspace).runtime),
  );
  alpha.setDefaultThinkingLevel("max");
  await alpha.flush();

  const config = readConfig(workspace);
  const restartedRuntime = resolveRuntimeConfig(config.runtime);
  assert.equal(createManager(workspace, "alpha", restartedRuntime).getDefaultThinkingLevel(), "max");
  assert.equal(createManager(workspace, "beta", restartedRuntime).getDefaultThinkingLevel(), "low");
});

test("project-scoped Pi settings fail instead of becoming ephemeral", async () => {
  const workspace = createWorkspace();
  const settings = createManager(
    workspace,
    "alpha",
    resolveRuntimeConfig(readConfig(workspace).runtime),
  );
  settings.setProjectSkillPaths(["./skills"]);
  await settings.flush();

  const errors = settings.drainErrors();
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.scope, "project");
  assert.match(errors[0]?.error.message ?? "", /does not support project-scoped Pi settings/);
});

test("Pi preference config cannot bypass Shrimpy model or resource policy", () => {
  assert.throws(
    () => validateRawConfig({ pi: { settings: { defaultModel: "model" } } }),
    /belongs in Shrimpy model policy/,
  );
  assert.throws(
    () => validateRawConfig({ pi: { settings: { packages: ["example"] } } }),
    /belongs in Shrimpy resource policy/,
  );
});

function createManager(
  workspace: string,
  agentId: string,
  runtimeConfig: ReturnType<typeof resolveRuntimeConfig>,
) {
  return createSessionSettingsManager({
    workspace,
    agentId,
    runtimeConfig,
    settings: {
      theme: runtimeConfig.theme,
      quietStartup: runtimeConfig.quietStartup,
      compaction: runtimeConfig.compaction,
    },
  });
}

function createWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "shrimpy-session-settings-"));
  mkdirSync(join(workspace, "config"), { recursive: true });
  writeFileSync(
    join(workspace, "config", "shrimpy.json"),
    JSON.stringify({
      agents: [
        { id: "alpha", thinking: "medium" },
        { id: "beta", thinking: "low" },
      ],
      runtime: {
        theme: "shrimpy",
        quietStartup: true,
        compaction: {
          enabled: true,
          reserveTokens: 32768,
          keepRecentTokens: 30000,
        },
      },
      pi: {
        settings: {
          collapseChangelog: true,
        },
      },
    }, null, 2),
  );
  return workspace;
}

function readConfig(workspace: string): {
  agents?: Array<{ id: string; thinking?: string }>;
  runtime?: {
    theme?: string;
    quietStartup?: boolean;
    compaction?: {
      enabled?: boolean;
      reserveTokens?: number;
      keepRecentTokens?: number;
    };
  };
  pi?: { settings?: Record<string, unknown> };
} {
  return JSON.parse(
    readFileSync(join(workspace, "config", "shrimpy.json"), "utf-8"),
  );
}
