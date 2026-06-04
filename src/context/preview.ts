import { join } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import {
  makeMessage,
  textContent,
} from "../channels/index.js";
import {
  createGatewaySessionDescriptor,
  createStoredSessionDescriptor,
  type SessionDescriptor,
} from "../sessions/spec.js";
import {
  assembleSessionPrompt,
  type SessionPromptAssembly,
} from "../sessions/prompt.js";
import {
  assemblePromptResourceSections,
  expandDirectoryResource,
  renderPromptSections,
  type PromptResourceRef,
} from "./resources.js";
import {
  findContextViewOverrides,
  isDirectoryResource,
  parseContextResource,
} from "./spec.js";
import {
  commandMatchesChannel,
  type ContextSourceConfig,
  isCommandSource,
  resolveContextSource,
  type ResolvedContextCommandSource,
} from "./source.js";
import {
  formatChannelMessage,
} from "./turn/channel-message.js";
import {
  buildTurnContext,
} from "./turn/service.js";
import {
  renderTurnContext,
} from "./turn/render.js";
import {
  runContextSourceCommand,
} from "./turn/command-source.js";
import type {
  TurnContext,
  TurnContextItem,
} from "./turn/types.js";

export type ContextSourceKind = "file" | "directory" | "command" | "runtime";

export interface ContextPreviewTarget {
  agentId: string;
  descriptor: SessionDescriptor;
  sessionType: string;
  cwd: string;
}

export interface SessionContextPreview {
  target: ContextPreviewTarget;
  assembly: SessionPromptAssembly;
  turnContext?: TurnContext;
  turnContextText?: string;
  userMessage?: string;
}

export interface ContextSourceView {
  id: string;
  type: ContextSourceKind;
  scope: "session" | "turn";
  origin: string;
  summary: string;
  source?: ContextSourceConfig;
  path?: string;
  rootPath?: string;
  command?: ResolvedContextCommandSource;
  prompt?: {
    idPrefix: string;
    reason: string;
  };
}

export interface ContextSourceRunResult {
  output: string;
  items?: TurnContextItem[];
  error?: string;
}

export function buildContextPreviewTarget(
  runtime: AppRuntime,
  input: {
    agentId?: string;
    channel?: string;
    sessionType?: string;
    cwd?: string;
  },
): ContextPreviewTarget {
  const agent = runtime.getAgent(input.agentId);
  const agentPaths = runtime.getAgentPaths(agent.id);
  const cwd = input.cwd ?? process.cwd();
  const sessionType = input.sessionType
    ?? (input.channel ? "gateway" : "preview");
  const descriptor = input.channel
    ? {
      ...createGatewaySessionDescriptor({
        workspacePath: agentPaths.root,
        agentId: agent.id,
        channel: input.channel,
        cwd,
      }),
      kind: sessionType,
    }
    : createStoredSessionDescriptor({
      workspacePath: agentPaths.root,
      agentId: agent.id,
      sessionName: join("context-preview", agent.id),
      kind: sessionType,
      cwd,
    });

  return {
    agentId: agent.id,
    descriptor,
    sessionType,
    cwd,
  };
}

export function makeContextPreviewMessage(
  channel: string | undefined,
  text: string,
) {
  if (!channel) return undefined;
  return makeMessage({
    sender: {
      kind: "human",
      actorId: "human:preview",
      displayName: "(user)",
    },
    origin: {
      transport: "cli",
      sourceChannel: channel,
    },
    content: textContent(text),
  });
}

export async function buildSessionContextPreview(
  runtime: AppRuntime,
  input: {
    agentId?: string;
    channel?: string;
    sessionType?: string;
    provider?: string;
    model?: string;
    skill?: string;
    prompt?: string;
    includeTurn?: boolean;
    cwd?: string;
  },
): Promise<SessionContextPreview> {
  const target = buildContextPreviewTarget(runtime, input);
  const agent = runtime.getAgent(target.agentId);
  const bootstrap = await runtime.createBootstrap({
    agentId: target.agentId,
    cwd: target.cwd,
  });
  const plan = {
    descriptor: target.descriptor,
    model: runtime.resolveModel(
      bootstrap,
      input.provider,
      input.model,
      agent.model,
      { allowMissingDefault: true },
    ),
    defaultThinking: agent.thinking,
    prompt: {
      skills: input.skill ? [input.skill] : undefined,
    },
  };
  const assembly = assembleSessionPrompt(bootstrap, plan);
  const prompt = input.prompt ?? "";
  const previewMessage = makeContextPreviewMessage(input.channel, prompt);
  const userMessage = prompt
    ? previewMessage && input.channel
      ? formatChannelMessage(input.channel, previewMessage)
      : prompt
    : undefined;
  const turnContext = input.includeTurn
    ? await buildTurnContext({
      runtime,
      descriptor: target.descriptor,
      currentMessage: previewMessage,
      preview: true,
    })
    : undefined;

  return {
    target,
    assembly,
    turnContext,
    turnContextText: turnContext ? renderTurnContext(turnContext) : undefined,
    userMessage,
  };
}

export async function buildContextTurnPreview(
  runtime: AppRuntime,
  input: {
    agentId?: string;
    channel?: string;
    sessionType?: string;
    prompt?: string;
    cwd?: string;
  },
): Promise<{
  target: ContextPreviewTarget;
  turnContext: TurnContext;
  text: string;
}> {
  const target = buildContextPreviewTarget(runtime, input);
  const previewMessage = makeContextPreviewMessage(
    input.channel,
    input.prompt ?? "",
  );
  const turnContext = await buildTurnContext({
    runtime,
    descriptor: target.descriptor,
    currentMessage: previewMessage,
    preview: true,
  });

  return {
    target,
    turnContext,
    text: renderTurnContext(turnContext),
  };
}

export function collectContextSources(input: {
  runtime: AppRuntime;
  agentId?: string;
  channel?: string;
}): ContextSourceView[] {
  const agent = input.runtime.getAgent(input.agentId);
  const agentPaths = input.runtime.getAgentPaths(agent.id);
  const out: ContextSourceView[] = [];

  const addConfigured = (
    source: ContextSourceConfig,
    origin: string,
    prompt: ContextSourceView["prompt"],
  ): void => {
    out.push(createSourceView({
      source,
      origin,
      agentRootPath: agentPaths.root,
      workspacePath: input.runtime.paths.workspace,
      prompt,
    }));
  };

  input.runtime.resolved.context.sources.forEach((source) =>
    addConfigured(source, "base", {
      idPrefix: "base",
      reason: "Configured base context resource",
    })
  );

  const overrides = findContextViewOverrides(input.runtime.resolved.context, {
    agentId: agent.id,
    channel: input.channel,
  });
  overrides.forEach((override, overrideIndex) => {
    override.sources?.forEach((source) =>
      addConfigured(source, `view:${overrideIndex}`, {
        idPrefix: "channel",
        reason: contextViewReason({
          agentId: agent.id,
          channel: input.channel,
        }),
      })
    );
  });

  out.push({
    id: "runtime:turn-context",
    type: "runtime",
    scope: "turn",
    origin: "runtime",
    summary: "built-in turn context producers",
  });

  return dedupeSourceIds(out);
}

export async function runContextSource(input: {
  source: ContextSourceView;
  runtime: AppRuntime;
  agentId?: string;
  channel?: string;
  sessionType?: string;
}): Promise<ContextSourceRunResult> {
  const agent = input.runtime.getAgent(input.agentId);
  const sessionType = input.sessionType
    ?? (input.channel ? "gateway" : "preview");

  if (input.source.command) {
    return runCommandContextSource(input.source.command, {
      runtime: input.runtime,
      agentId: agent.id,
      channel: input.channel,
      sessionType,
    });
  }
  if (input.source.type === "runtime") {
    const preview = await buildContextTurnPreview(input.runtime, {
      agentId: agent.id,
      channel: input.channel,
      sessionType,
    });
    return { output: preview.text };
  }
  if (!input.source.rootPath || !input.source.path) {
    return { output: "" };
  }

  return {
    output: renderPromptSource(input.source),
  };
}

function createSourceView(input: {
  source: ContextSourceConfig;
  origin: string;
  agentRootPath: string;
  workspacePath: string;
  prompt: ContextSourceView["prompt"];
}): ContextSourceView {
  const resolved = resolveContextSource(input.source);
  if (isCommandSource(resolved)) {
    return {
      id: resolved.id,
      type: "command",
      scope: "turn",
      origin: input.origin,
      summary: `${resolved.command} channels=${resolved.channels.join(",")}`,
      source: input.source,
      command: resolved,
    };
  }

  const parsed = parseContextResource(resolved);
  const rootPath = parsed.scope === "agent" ? input.agentRootPath : input.workspacePath;
  const type = isDirectoryResource(input.source) ? "directory" : "file";
  return {
    id: `${type}:${parsed.scope}:${parsed.path}`,
    type,
    scope: "session",
    origin: input.origin,
    summary: resolved,
    source: input.source,
    path: parsed.path,
    rootPath,
    prompt: input.prompt,
  };
}

function renderPromptSource(source: ContextSourceView): string {
  if (!source.rootPath || !source.path) return "";
  const resources = promptRefsForSource(source);
  if (resources.length === 0) return "";
  const sections = assemblePromptResourceSections(resources, {
    idPrefix: source.prompt?.idPrefix,
    reason: source.prompt?.reason,
  });
  return renderPromptSections(sections);
}

function promptRefsForSource(source: ContextSourceView): PromptResourceRef[] {
  if (!source.rootPath || !source.path) return [];
  if (source.type === "directory") {
    return expandDirectoryResource(source.rootPath, source.path);
  }
  return [{
    rootPath: source.rootPath,
    resourcePath: source.path,
  }];
}

async function runCommandContextSource(
  command: ResolvedContextCommandSource,
  input: {
    runtime: AppRuntime;
    agentId: string;
    channel?: string;
    sessionType: string;
  },
): Promise<ContextSourceRunResult> {
  if (!commandMatchesChannel(command, input.channel)) {
    return { output: "" };
  }
  const result = await runContextSourceCommand(command, {
    runtime: input.runtime,
    agentId: input.agentId,
    channel: input.channel,
    sessionType: input.sessionType,
  });
  return {
    output: result.raw,
    items: result.items,
    error: result.error,
  };
}

function dedupeSourceIds(sources: ContextSourceView[]): ContextSourceView[] {
  const seen = new Map<string, number>();
  return sources.map((source) => {
    const count = seen.get(source.id) ?? 0;
    seen.set(source.id, count + 1);
    return count === 0
      ? source
      : { ...source, id: `${source.id}#${count + 1}` };
  });
}

function contextViewReason(input: {
  agentId?: string;
  channel?: string;
}): string {
  if (input.agentId && input.channel) {
    return `Matched agent context view resource for ${input.agentId} in ${input.channel}`;
  }
  if (input.channel) return `Matched channel-specific context resource for ${input.channel}`;
  if (input.agentId) return `Matched agent context view resource for ${input.agentId}`;
  return "Channel-specific context resource";
}
