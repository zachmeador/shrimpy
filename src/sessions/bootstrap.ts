import {
  type DefaultResourceLoader,
  ModelRuntime,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { assembleBasePromptSections, assemblePromptContext } from "../context/assembly.js";
import { createPromptSection, type PromptResourceRef, type PromptSection } from "../context/resources.js";
import { FALLBACK_IDENTITY_TEXT } from "../context/system/prompts.js";
import { resolveBootEnv, type BootEnv } from "../context/env.js";
import type { ResolvedContextConfig } from "../context/spec.js";
import type { RuntimeConfig } from "../config/runtime.js";
import type { ModelPoliciesConfig } from "../config/model.js";
import { resolveAgentsConfig } from "../config/agents.js";
import { listEffectiveSkillEntryPathsFromPaths } from "../skills/catalog.js";
import { createShrimpyResourceLoader } from "./pi-resources.js";
import { resolveAgentToolPolicy } from "../tools/policy.js";

export interface SessionBootstrap {
  settingsManager: SettingsManager;
  resourceLoader: DefaultResourceLoader;
  modelRuntime: ModelRuntime;
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  authPath: string;
  modelsPath: string;
  modelsStorePath: string;
  modelPolicies?: ModelPoliciesConfig;
  contextConfig: ResolvedContextConfig;
  runtimeConfig: Required<RuntimeConfig>;
  bootEnv: BootEnv;
  baseSystemPrompt: string;
  baseSystemSections: PromptSection[];
  skillEntryPaths: string[];
}

interface SessionBootstrapSource {
  config: {
    agents?: unknown;
    modelPolicies?: ModelPoliciesConfig;
  };
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  authPath: string;
  modelsPath: string;
  modelsStorePath: string;
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

  const settingsManager = SettingsManager.inMemory({
    theme: runtimeConfig.theme,
    quietStartup: runtimeConfig.quietStartup,
    compaction: runtimeConfig.compaction,
  });

  const modelRuntime = await ModelRuntime.create({
    authPath: source.authPath,
    modelsPath: source.modelsPath,
    modelsStorePath: source.modelsStorePath,
    allowModelNetwork: false,
  });

  const resourceLoader = createShrimpyResourceLoader({
    cwd,
    settingsManager,
    modelRuntime,
    runtimeConfig,
    systemPrompt: baseSystemPrompt,
    skillPaths: skillEntryPaths,
  });
  await resourceLoader.reload();

  return {
    settingsManager,
    resourceLoader,
    modelRuntime,
    agentId,
    agentRootPath,
    workspacePath,
    authPath: source.authPath,
    modelsPath: source.modelsPath,
    modelsStorePath: source.modelsStorePath,
    modelPolicies: config.modelPolicies,
    contextConfig,
    runtimeConfig,
    bootEnv,
    baseSystemPrompt,
    baseSystemSections,
    skillEntryPaths,
  };
}
