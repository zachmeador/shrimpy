import type { Api, Model } from "@earendil-works/pi-ai";
import {
  assembleContextViewSections,
  assemblePromptContext,
  buildRuntimeEnvironmentSection,
  buildSessionDeliverySection,
  resolveContextEnvKeys,
} from "./assembly.js";
import { resolveSessionEnv } from "./env.js";
import {
  assemblePromptResourceSections,
  createPromptSection,
  type PromptSection,
} from "./resources.js";
import { FALLBACK_IDENTITY_TEXT } from "./system/scaffold.js";
import { getSkillPromptResourcesFromPaths } from "../skills/index.js";
import type { SessionBootstrap } from "../sessions/bootstrap.js";
import { buildContainedSystemPrompt } from "./contained-system-prompt.js";
import type { SessionOpenPlan } from "../sessions/spec.js";
import { sessionChannel } from "../sessions/spec.js";

export interface SessionPromptAssembly {
  systemPrompt: string;
  baseSystemPrompt: string;
  resolvedModel: Model<Api> | undefined;
  cwd: string;
  envKeys: string[];
  env: Record<string, string>;
  sections: PromptSection[];
  baseSections: PromptSection[];
  containedSections: PromptSection[];
  needsCustomLoader: boolean;
}

export function assembleSessionPrompt(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
): SessionPromptAssembly {
  const { descriptor } = plan;
  const channel = sessionChannel(descriptor);
  const resolvedModel = plan.model;

  const cwd = descriptor.cwd ?? bootstrap.agentRootPath;
  const sessionEnv = resolveSessionEnv({
    descriptor,
    modelId: resolvedModel?.id ?? "unknown",
    provider: resolvedModel?.provider ?? "unknown",
    cwd,
  });
  const envKeys = resolveContextEnvKeys(
    bootstrap.contextConfig,
    channel,
    descriptor.key.agentId,
  );
  const env = { ...bootstrap.bootEnv, ...sessionEnv };
  const runtimeEnvironmentSection = buildRuntimeEnvironmentSection({
    envKeys,
    env,
  });
  const deliverySection = buildSessionDeliverySection({
    delivery: descriptor.delivery,
  });
  const stableRuntimeSections = [
    runtimeEnvironmentSection,
    deliverySection,
  ].filter((section): section is PromptSection => Boolean(section));

  const sessionPromptSections = assembleContextViewSections(
    bootstrap.agentRootPath,
    bootstrap.workspacePath,
    bootstrap.contextConfig,
    channel,
    descriptor.key.agentId,
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
    path: "inline/session_append_system_prompt",
    title: "Append System Prompt",
    kind: "instruction",
    source: "inline",
    reason: "Caller-provided session system prompt addition",
    content: plan.prompt?.appendSystemPrompt,
  });

  const needsCustomLoader =
    stableRuntimeSections.length > 0 ||
    extraBasePromptSections.length > 0 ||
    sessionPromptSections.length > 0 ||
    Boolean(appendSection);
  const baseContext = needsCustomLoader
    ? assemblePromptContext({
      sections: [
        bootstrap.baseSystemSections,
        stableRuntimeSections,
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
  const contained = buildContainedSystemPrompt({
    basePrompt: baseContext.systemPrompt,
    cwd,
    skills: bootstrap.runtimeConfig.noSkills
      ? []
      : bootstrap.resourceLoader.getSkills().skills,
  });

  return {
    systemPrompt: contained.systemPrompt,
    baseSystemPrompt: baseContext.systemPrompt,
    resolvedModel,
    cwd,
    envKeys,
    env,
    sections: [...baseContext.sections, ...contained.sections],
    baseSections: baseContext.sections,
    containedSections: contained.sections,
    needsCustomLoader,
  };
}
