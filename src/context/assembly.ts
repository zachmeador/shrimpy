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
  type ContextConfig,
  findContextViewOverrides,
  parseContextResource,
} from "./spec.js";
import type { ContextSourceConfig } from "./source.js";

export interface PromptContextAssembly {
  sections: PromptSection[];
  systemPrompt: string;
}

export type PromptSectionInput =
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
  return {
    sections,
    systemPrompt: renderPromptSections(sections) || opts.fallback || "",
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
  ctx: Required<ContextConfig>,
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
  ctx: Required<ContextConfig>,
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
    if (typeof source !== "string") continue; // command sources are turn-scoped
    const { scope, path } = parseContextResource(source);
    const rootPath = scope === "agent" ? agentRootPath : workspacePath;
    if (isDirectoryResource(source)) {
      refs.push(...expandDirectoryResource(rootPath, path));
    } else {
      refs.push({ rootPath, resourcePath: path });
    }
  }
  return refs;
}

export function buildSystemEnvSections(opts: {
  sessionType: string;
  channel?: string;
  envKeys: string[];
  env: Record<string, string | undefined>;
}): PromptSection[] {
  const sections: PromptSection[] = [];

  const envRows: string[] = [];
  for (const key of opts.envKeys) {
    const value = opts.env[key];
    if (value !== undefined && value !== "") {
      envRows.push(`- **${key}**: ${value}`);
    }
  }
  if (envRows.length > 0) {
    sections.push({
      id: "session:runtime_environment",
      title: "Runtime Environment",
      kind: "runtime",
      source: "runtime",
      reason: "Stable session environment facts",
      content: `## Runtime Environment\n\n${envRows.join("\n")}`,
    });
  }

  if (opts.sessionType === "gateway" && opts.channel) {
    sections.push({
      id: "session:delivery",
      title: "Delivery",
      kind: "runtime",
      source: "runtime",
      reason: "Channel sessions require explicit message delivery",
      content: [
        "## Delivery",
        "",
        `This session is attached to channel ${opts.channel}.`,
        "",
        "- Plain assistant text stays in this private session transcript. It is not sent to the channel.",
        "- To publish to the user on this channel, call reply(text), ask(text), notify(text), or report(summary).",
        `- For explicit routing or unusual cases, call send_message(channel=\"${opts.channel}\", text=\"...\").`,
        "- After a publication or send_message tool says the message was delivered, wait until a new message is received.",
      ].join("\n"),
    });
  }

  return sections;
}

export function resolveContextEnvKeys(
  ctx: Required<ContextConfig>,
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
