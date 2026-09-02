import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { isRecord } from "../util/record.js";

export type PiSettingsConfig = ReturnType<SettingsManager["getGlobalSettings"]>;

export interface PiConfig {
  settings?: PiSettingsConfig;
}

const SHRIMPY_OWNED_SETTINGS = new Map([
  ["theme", "runtime.theme"],
  ["quietStartup", "runtime.quietStartup"],
  ["compaction", "runtime.compaction"],
  ["defaultThinkingLevel", "agents[].thinking"],
  ["defaultProvider", "Shrimpy model policy"],
  ["defaultModel", "Shrimpy model policy"],
  ["enabledModels", "Shrimpy model policy"],
  ["defaultTools", "Shrimpy tool policy"],
  ["sessionDir", "Shrimpy session storage"],
  ["packages", "Shrimpy resource policy"],
  ["extensions", "Shrimpy resource policy"],
  ["skills", "Shrimpy resource policy"],
  ["prompts", "Shrimpy resource policy"],
  ["themes", "Shrimpy resource policy"],
]);

export function validatePiConfig(raw: unknown): PiConfig {
  if (!isRecord(raw)) throw new Error("pi must be an object");
  for (const key of Object.keys(raw)) {
    if (key !== "settings") throw new Error(`pi.${key} is not supported`);
  }
  if (raw.settings !== undefined && !isRecord(raw.settings)) {
    throw new Error("pi.settings must be an object");
  }
  if (isRecord(raw.settings)) {
    for (const [key, owner] of SHRIMPY_OWNED_SETTINGS) {
      if (raw.settings[key] !== undefined) {
        throw new Error(`pi.settings.${key} belongs in ${owner}`);
      }
    }
  }
  return raw as PiConfig;
}
