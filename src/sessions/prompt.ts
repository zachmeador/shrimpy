import type { Api, Model } from "@earendil-works/pi-ai";
import {
  assembleContextViewSections,
  assemblePromptContext,
  assemblePromptResourceSections,
  buildSystemEnvSections,
  createPromptSection,
  FALLBACK_IDENTITY_TEXT,
  resolveContextEnvKeys,
  resolveSessionEnv,
  type PromptSection,
} from "../context/index.js";
import { getSkillPromptResourcesFromPaths } from "../skills/index.js";
import type { SessionBootstrap } from "./bootstrap.js";
import type { SessionOpenPlan } from "./spec.js";

export interface ResolvedSessionModel {
  model: Model<Api>;
}

export interface SessionPromptAssembly {
  systemPrompt: string;
  resolvedModel: Model<Api> | undefined;
  cwd: string;
  envKeys: string[];
  env: Record<string, string>;
  sections: PromptSection[];
  needsCustomLoader: boolean;
}

export function assembleSessionPrompt(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
): SessionPromptAssembly {
  const { descriptor } = plan;
  let resolvedModel = plan.model;
  if (!resolvedModel) {
    const available = bootstrap.modelRegistry.getAvailable();
    if (available.length > 0) resolvedModel = available[0];
  }

  const cwd = descriptor.cwd ?? bootstrap.agentRootPath;
  const sessionEnv = resolveSessionEnv({
    descriptor,
    modelId: resolvedModel?.id ?? "unknown",
    provider: resolvedModel?.provider ?? "unknown",
    cwd,
  });
  const envKeys = resolveContextEnvKeys(
    bootstrap.contextConfig,
    descriptor.channel,
    descriptor.agentId ?? bootstrap.agentId,
  );
  const env = { ...bootstrap.bootEnv, ...sessionEnv };
  const stableEnvSections = buildSystemEnvSections({
    sessionType: descriptor.kind,
    channel: descriptor.channel,
    envKeys,
    env,
  });

  const sessionPromptSections = assembleContextViewSections(
    bootstrap.agentRootPath,
    bootstrap.workspacePath,
    bootstrap.contextConfig,
    descriptor.channel,
    descriptor.agentId ?? bootstrap.agentId,
  );
  const skillPromptResources = plan.prompt?.skills && !bootstrap.runtimeConfig.noSkills
    ? getSkillPromptResourcesFromPaths({
      agentId: bootstrap.agentId,
      agentRootPath: bootstrap.agentRootPath,
      workspacePath: bootstrap.workspacePath,
      skillIds: plan.prompt.skills,
    })
    : [];
  const basePromptResources = [
    ...skillPromptResources,
    ...(plan.prompt?.extraResources ?? []),
  ];
  const extraBasePromptSections = assemblePromptResourceSections(
    basePromptResources,
    {
      idPrefix: "session",
      reason: "Explicitly loaded session context resource",
    },
  );
  const appendSection = createPromptSection({
    id: "session:append_system_prompt",
    title: "Append System Prompt",
    kind: "instruction",
    source: "inline",
    reason: "Caller-provided session system prompt addition",
    content: plan.prompt?.appendSystemPrompt,
  });

  const needsCustomLoader =
    stableEnvSections.length > 0 ||
    extraBasePromptSections.length > 0 ||
    sessionPromptSections.length > 0 ||
    Boolean(appendSection);
  const context = needsCustomLoader
    ? assemblePromptContext({
      sections: [
        bootstrap.baseSystemSections,
        stableEnvSections,
        extraBasePromptSections,
        sessionPromptSections,
        appendSection,
      ],
      fallback: FALLBACK_IDENTITY_TEXT,
    })
    : {
      sections: bootstrap.baseSystemSections,
      systemPrompt: bootstrap.baseSystemPrompt,
    };

  return {
    systemPrompt: context.systemPrompt,
    resolvedModel,
    cwd,
    envKeys,
    env,
    sections: context.sections,
    needsCustomLoader,
  };
}
