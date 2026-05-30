import { join } from "node:path";
import {
  DefaultResourceLoader,
  type ExtensionFactory,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { projectRoot } from "../app/project-root.js";
import type { RuntimeConfig } from "../config/index.js";
import {
  applyModelVariantInferenceToPayload,
  type ModelVariantInference,
} from "../inference/params.js";

const SHRIMPY_EXTENSION_PATHS = [
  join(projectRoot, "extensions", "hello.ts"),
  join(projectRoot, "extensions", "setup.ts"),
  join(projectRoot, "extensions", "compaction-bias.ts"),
  join(projectRoot, "extensions", "compact-tools.ts"),
  join(projectRoot, "extensions", "thinking.ts"),
  join(projectRoot, "extensions", "shrimpy-commands.ts"),
];

const SHRIMPY_THEME_PATHS = [join(projectRoot, "themes")];

export function createShrimpyResourceLoader(opts: {
  cwd: string;
  settingsManager: SettingsManager;
  runtimeConfig: Required<RuntimeConfig>;
  systemPrompt: string;
  inference?: ModelVariantInference;
  model?: Model<Api>;
}): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: join(projectRoot, ".shrimpy"),
    settingsManager: opts.settingsManager,
    additionalExtensionPaths: SHRIMPY_EXTENSION_PATHS,
    extensionFactories: createInferenceExtensionFactories(opts.inference, opts.model),
    additionalSkillPaths: [],
    additionalThemePaths: SHRIMPY_THEME_PATHS,
    noSkills: true,
    noPromptTemplates: opts.runtimeConfig.noPromptTemplates,
    // Shrimpy owns session context assembly and passes Pi one explicit
    // prompt body. Keep Pi discovery for extensions/themes, but strip
    // discovered skills, AGENTS.md, and APPEND_SYSTEM.md inputs so cwd-local
    // repos do not silently reshape the session.
    systemPrompt: opts.systemPrompt,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    appendSystemPromptOverride: () => [],
  });
}

function createInferenceExtensionFactories(
  inference: ModelVariantInference | undefined,
  model: Model<Api> | undefined,
): ExtensionFactory[] {
  if (!inference) return [];
  return [
    (pi) => {
      pi.on("before_provider_request", (event) =>
        applyModelVariantInferenceToPayload(event.payload, inference, model)
      );
    },
  ];
}
