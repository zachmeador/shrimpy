import {
  AuthStorage,
  ModelRegistry,
  type DefaultResourceLoader,
  type SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { createInlineSettingsManager } from "./inline-settings.js";
import {
  assembleBasePromptSections,
  assemblePromptContext,
  createPromptSection,
  FALLBACK_IDENTITY_TEXT,
  resolveBootEnv,
  type BootEnv,
  type ResolvedContextConfig,
  type PromptResourceRef,
  type PromptSection,
} from "../context/index.js";
import type { RuntimeConfig, ShrimpyConfig } from "../config/index.js";
import { resolveAgentsConfig } from "../config/index.js";
import { listEffectiveSkillEntryPathsFromPaths } from "../skills/index.js";
import { createShrimpyResourceLoader } from "./pi-resources.js";
import { resolveAgentToolPolicy } from "../tools/policy.js";

export interface SessionBootstrap {
  settingsManager: SettingsManager;
  resourceLoader: DefaultResourceLoader;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  authPath: string;
  modelsPath: string;
  config: ShrimpyConfig;
  contextConfig: ResolvedContextConfig;
  runtimeConfig: Required<RuntimeConfig>;
  bootEnv: BootEnv;
  baseSystemPrompt: string;
  baseSystemSections: PromptSection[];
  skillEntryPaths: string[];
}

interface SessionBootstrapSource {
  config: ShrimpyConfig;
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  authPath: string;
  modelsPath: string;
  contextConfig: ResolvedContextConfig;
  runtimeConfig: Required<RuntimeConfig>;
}

export async function createBootstrap(
  source: SessionBootstrapSource,
  opts?: {
    appendSystemPrompt?: string;
    basePromptResources?: PromptResourceRef[];
    cwd?: string;
  },
): Promise<SessionBootstrap> {
  const {
    config,
    agentId,
    agentRootPath,
    workspacePath,
    contextConfig,
    runtimeConfig,
  } = source;
  const cwd = opts?.cwd ?? agentRootPath;
  const bootEnv = resolveBootEnv(workspacePath);
  const resolvedAgent = resolveAgentsConfig(config.agents)
    .find((agent) => agent.id === agentId);
  const activeToolNames = resolvedAgent
    ? resolveAgentToolPolicy(resolvedAgent).activeToolNames
    : undefined;
  const skillEntryPaths = source.runtimeConfig.noSkills
    ? []
    : listEffectiveSkillEntryPathsFromPaths({
      agentId,
      agentRootPath,
      workspacePath,
      activeToolNames,
    });
  const baseSections = assembleBasePromptSections(
    agentRootPath,
    workspacePath,
    contextConfig,
    {
      extraResources: opts?.basePromptResources,
    },
  );
  if (baseSections.length === 0) {
    baseSections.push({
      id: "base:fallback",
      path: "fallback",
      title: "Fallback Identity",
      kind: "identity",
      source: "fallback",
      reason: "No configured context resources were readable",
      content: FALLBACK_IDENTITY_TEXT,
    });
  }
  const appendSection = createPromptSection({
    id: "base:append_system_prompt",
    path: "inline/bootstrap_append_system_prompt",
    title: "Append System Prompt",
    kind: "instruction",
    source: "inline",
    reason: "Caller-provided bootstrap system prompt addition",
    content: opts?.appendSystemPrompt,
  });
  const baseContext = assemblePromptContext({
    sections: [
      baseSections,
      appendSection,
    ],
    fallback: FALLBACK_IDENTITY_TEXT,
  });
  const baseSystemSections = baseContext.sections;
  const baseSystemPrompt = baseContext.systemPrompt;

  const settingsManager = createInlineSettingsManager({
    theme: runtimeConfig.theme,
    quietStartup: runtimeConfig.quietStartup,
    compaction: runtimeConfig.compaction,
  });

  const resourceLoader = createShrimpyResourceLoader({
    cwd,
    settingsManager,
    runtimeConfig,
    systemPrompt: baseSystemPrompt,
    skillPaths: skillEntryPaths,
  });
  await resourceLoader.reload();

  const authStorage = AuthStorage.create(source.authPath);
  const modelRegistry = ModelRegistry.create(
    authStorage,
    source.modelsPath,
  );

  return {
    settingsManager,
    resourceLoader,
    authStorage,
    modelRegistry,
    agentId,
    agentRootPath,
    workspacePath,
    authPath: source.authPath,
    modelsPath: source.modelsPath,
    config,
    contextConfig,
    runtimeConfig,
    bootEnv,
    baseSystemPrompt,
    baseSystemSections,
    skillEntryPaths,
  };
}
