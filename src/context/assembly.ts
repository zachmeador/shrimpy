import {
  assemblePromptResourceSections,
  expandDirectoryResource,
  orderPromptSectionsByKind,
  renderPromptSections,
  type PromptSection,
  type PromptResourceRef,
} from "./resources.js";
import {
  isDirectoryResource,
  type ResolvedContextConfig,
  type ContextSourceConfig,
  findContextViewOverrides,
  parseContextResource,
} from "./spec.js";
import { isPromptRuntimeEnvKey } from "./env.js";

interface PromptContextAssembly {
  sections: PromptSection[];
  systemPrompt: string;
}

type PromptSectionInput =
  | PromptSection
  | PromptSection[]
  | undefined
  | null
  | false;

export function assemblePromptContext(opts: {
  sections: PromptSectionInput[];
  fallback?: string;
}): PromptContextAssembly {
  const sections = orderPromptSectionsByKind(collectPromptSections(opts.sections));
  const rendered = renderPromptSections(sections);
  return {
    sections,
    systemPrompt: rendered || (opts.fallback ?? ""),
  };
}

export function collectPromptSections(inputs: PromptSectionInput[]): PromptSection[] {
  const sections: PromptSection[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (Array.isArray(input)) {
      sections.push(...input);
    } else {
      sections.push(input);
    }
  }
  return sections;
}

export function assembleBasePromptSections(
  agentRootPath: string,
  workspacePath: string,
  ctx: ResolvedContextConfig,
  opts?: {
    extraResources?: PromptResourceRef[];
    extraText?: string;
  },
): PromptSection[] {
  const resources: PromptResourceRef[] = [
    ...contextResourcesToPromptRefs(ctx.sources, agentRootPath, workspacePath),
    ...(opts?.extraResources ?? []),
  ];

  const sections = assemblePromptResourceSections(resources, {
    idPrefix: "base",
    reason: "Configured base context resource",
  });

  if (opts?.extraText) {
    sections.push({
      id: "base:extra_text",
      path: "inline/base_extra_text",
      title: "Extra Base Context",
      kind: "instruction",
      source: "inline",
      reason: "Additional base context text",
      content: opts.extraText,
    });
  }

  return sections;
}

export function assembleContextViewSections(
  agentRootPath: string,
  workspacePath: string,
  ctx: ResolvedContextConfig,
  channel?: string,
  agentId?: string,
): PromptSection[] {
  const resources: PromptResourceRef[] = [];

  const overrides = findContextViewOverrides(ctx, { agentId, channel });
  for (const override of overrides) {
    if (override.sources) {
      resources.push(...contextResourcesToPromptRefs(
        override.sources,
        agentRootPath,
        workspacePath,
      ));
    }
  }

  return assemblePromptResourceSections(resources, {
    idPrefix: "channel",
    reason: agentId && channel
      ? `Matched agent context view resource for ${agentId} in ${channel}`
      : channel
        ? `Matched channel-specific context resource for ${channel}`
        : agentId
          ? `Matched agent context view resource for ${agentId}`
          : "Channel-specific context resource",
  });
}

export function contextResourcesToPromptRefs(
  sources: ContextSourceConfig[],
  agentRootPath: string,
  workspacePath: string,
): PromptResourceRef[] {
  const refs: PromptResourceRef[] = [];
  for (const source of sources) {
    const { scope, path } = parseContextResource(source);
    const rootPath = scope === "agent" ? agentRootPath : workspacePath;
    if (isDirectoryResource(source)) {
      refs.push(...expandDirectoryResource(rootPath, path));
    } else {
      refs.push({
        rootPath,
        resourcePath: path,
      });
    }
  }
  return refs;
}

export function buildRuntimeEnvironmentSection(opts: {
  envKeys: string[];
  env: Record<string, string | undefined>;
}): PromptSection | undefined {
  const envRows: string[] = [];
  for (const key of opts.envKeys) {
    if (!isPromptRuntimeEnvKey(key)) continue;
    const value = opts.env[key];
    if (value !== undefined && value !== "") {
      envRows.push(`- **${promptRuntimeEnvLabel(key)}**: ${value}`);
    }
  }
  if (envRows.length === 0) return undefined;

  return {
    id: "session:runtime_environment",
    path: "runtime/environment",
    title: "Runtime Environment",
    kind: "runtime",
    source: "runtime",
    reason: "Stable session environment facts",
    content: `## Runtime Environment\n\n${envRows.join("\n")}`,
  };
}

function promptRuntimeEnvLabel(key: string): string {
  if (key === "booted_at_iso") return "session_booted_at_utc";
  return key;
}

export function resolveContextEnvKeys(
  ctx: ResolvedContextConfig,
  channel?: string,
  agentId?: string,
): string[] {
  let envKeys = ctx.env;

  const overrides = findContextViewOverrides(ctx, { agentId, channel });
  for (const override of overrides) {
    if (override.env) {
      envKeys = override.env;
    }
  }

  return envKeys;
}
