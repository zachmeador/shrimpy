import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { RuntimeConfig } from "../config/runtime.js";
import { editConfigFile } from "../config/store.js";
import { isRecord } from "../util/record.js";

export async function showShrimpySettings(
  ctx: ExtensionCommandContext,
  runtime: AppRuntime,
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify("/shrimpy settings is available in the TUI.", "info");
    return;
  }

  while (true) {
    const skills = !runtime.resolved.runtime.noSkills;
    const templates = !runtime.resolved.runtime.noPromptTemplates;
    const selected = await ctx.ui.select("Shrimpy session defaults", [
      `Skill context (new sessions): ${onOff(skills)}`,
      `Prompt templates (new sessions): ${onOff(templates)}`,
      "Done",
    ]);
    if (!selected || selected === "Done") return;

    if (selected.startsWith("Skill context")) {
      persistRuntimeConfig(runtime, { noSkills: skills });
    } else if (selected.startsWith("Prompt templates")) {
      persistRuntimeConfig(runtime, { noPromptTemplates: templates });
    }
  }
}

function onOff(enabled: boolean): "on" | "off" {
  return enabled ? "on" : "off";
}

type RuntimeConfigPatch = {
  noSkills?: boolean;
  noPromptTemplates?: boolean;
};

function persistRuntimeConfig(runtime: AppRuntime, patch: RuntimeConfigPatch): void {
  editConfigFile(runtime.paths.workspace, (raw) => {
    const current = isRecord(raw.runtime) ? raw.runtime : {};
    raw.runtime = applyPatch(current, patch);
  });

  const currentConfig = isRecord(runtime.config.runtime)
    ? runtime.config.runtime
    : {};
  runtime.config.runtime = applyPatch(currentConfig, patch) as RuntimeConfig;

  for (const [key, value] of Object.entries(patch)) {
    (runtime.resolved.runtime as Record<string, unknown>)[key] = value;
  }
}

function applyPatch(
  current: Record<string, unknown>,
  patch: RuntimeConfigPatch,
): Record<string, unknown> {
  return { ...current, ...patch };
}
