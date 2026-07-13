import { join } from "node:path";
import {
  DefaultResourceLoader,
  type ExtensionFactory,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { projectRoot } from "../app/project-root.js";
import type { RuntimeConfig } from "../config/index.js";
import { buildContainedSystemPromptFromPiOptions } from "../context/contained-system-prompt.js";
import {
  createTurnContextExtensionFactory,
  type SessionTurnContextController,
} from "./turn-context.js";

const SHRIMPY_EXTENSION_PATHS = [
  join(projectRoot, "extensions", "hello.ts"),
  join(projectRoot, "extensions", "compaction-bias.ts"),
  join(projectRoot, "extensions", "compact-tools.ts"),
  join(projectRoot, "extensions", "model-switch-renderer.ts"),
  join(projectRoot, "extensions", "thinking.ts"),
  join(projectRoot, "extensions", "shrimpy-commands.ts"),
];

const SHRIMPY_THEME_PATHS = [join(projectRoot, "themes")];

export function createShrimpyResourceLoader(opts: {
  cwd: string;
  settingsManager: SettingsManager;
  runtimeConfig: Required<RuntimeConfig>;
  systemPrompt: string;
  skillPaths?: string[];
  turnContextController?: SessionTurnContextController;
  extensionFactories?: ExtensionFactory[];
}): DefaultResourceLoader {
  return new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: join(projectRoot, ".shrimpy"),
    settingsManager: opts.settingsManager,
    additionalExtensionPaths: SHRIMPY_EXTENSION_PATHS,
    extensionFactories: createExtensionFactories({
      turnContextController: opts.turnContextController,
      additional: opts.extensionFactories,
    }),
    additionalSkillPaths: opts.runtimeConfig.noSkills
      ? []
      : (opts.skillPaths ?? []),
    additionalThemePaths: SHRIMPY_THEME_PATHS,
    noSkills: true,
    noPromptTemplates: opts.runtimeConfig.noPromptTemplates,
    // Shrimpy owns session context assembly and passes Pi the file-backed base
    // prompt body. The prompt-containment extension below replaces Pi's
    // built prompt with Shrimpy's contained system prompt before model calls.
    // Keep Pi discovery for extensions/themes, but strip ambient skills,
    // AGENTS.md, and APPEND_SYSTEM.md inputs so cwd-local repos do not silently
    // reshape the session. Shrimpy-approved skill paths are passed explicitly
    // through additionalSkillPaths above.
    systemPrompt: opts.systemPrompt,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    appendSystemPromptOverride: () => [],
  });
}

function createExtensionFactories(opts: {
  turnContextController?: SessionTurnContextController;
  additional?: ExtensionFactory[];
}): ExtensionFactory[] {
  return [
    ...(opts.additional ?? []),
    ...(
      opts.turnContextController
        ? [createTurnContextExtensionFactory(opts.turnContextController)]
        : []
    ),
    createPromptContainmentExtensionFactory(),
  ];
}

function createPromptContainmentExtensionFactory(): ExtensionFactory {
  return (pi) => {
    pi.on("before_agent_start", (event) => ({
      systemPrompt: buildContainedSystemPromptFromPiOptions(
        event.systemPromptOptions,
        event.systemPrompt,
      ),
    }));
  };
}
