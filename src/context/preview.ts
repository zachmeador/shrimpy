import type { AppRuntime } from "../app/runtime.js";
import {
  makeMessage,
  textContent,
} from "../channels/index.js";
import {
  createSessionDescriptor,
  type SessionDescriptor,
} from "../sessions/spec.js";
import {
  createChannelSessionKey,
  createLocalSessionKey,
} from "../sessions/identity.js";
import {
  assembleSessionPrompt,
  type SessionPromptAssembly,
} from "./session-prompt.js";
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
  type ContextSourceConfig,
} from "./source.js";
import {
  formatChannelMessage,
} from "./turn/channel-message.js";
import {
  buildTurnContext,
  isProducerFresh,
} from "./turn/service.js";
import {
  renderTurnContext,
} from "./turn/render.js";
import {
  producerMatchesChannel,
  runContextTurnProducer,
  type ResolvedContextTurnProducer,
} from "./turn/producer.js";
import {
  contextTurnProducerStateKey,
  readContextState,
} from "./turn/state.js";
import type {
  TurnContext,
  TurnContextItem,
  TurnProducerReport,
  TurnProducerStatus,
} from "./turn/types.js";

type ContextSourceKind = "file" | "directory";
type ContextProducerKind = "command" | "runtime";

interface ContextPreviewTarget {
  agentId: string;
  descriptor: SessionDescriptor;
  sessionType: string;
  cwd: string;
}

interface SessionContextPreview {
  target: ContextPreviewTarget;
  assembly: SessionPromptAssembly;
  turnContext?: TurnContext;
  turnContextText?: string;
  userMessage?: string;
}

export interface ContextSourceView {
  id: string;
  type: ContextSourceKind;
  scope: "session";
  origin: string;
  summary: string;
  source?: ContextSourceConfig;
  path?: string;
  rootPath?: string;
  prompt?: {
    idPrefix: string;
    reason: string;
  };
}

export interface ContextSourceRunResult {
  output: string;
}

export interface ContextProducerView {
  id: string;
  type: ContextProducerKind;
  scope: "turn";
  origin: string;
  summary: string;
  matched: boolean;
  status: TurnProducerStatus;
  reason?: string;
  producer?: ResolvedContextTurnProducer;
}

export interface ContextProducerRunResult {
  output: string;
  items?: TurnContextItem[];
  error?: string;
  report: TurnProducerReport;
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
  const cwd = input.cwd ?? runtime.getAgentCwd(agent.id);
  const sessionType = input.sessionType
    ?? (input.channel ? "gateway" : "preview");
  const descriptor = createSessionDescriptor({
    agentRoot: agentPaths.root,
    key: input.channel
      ? createChannelSessionKey({ agentId: agent.id, channel: input.channel })
      : createLocalSessionKey({ agentId: agent.id, name: "context-preview" }),
    purpose: sessionType,
    delivery: input.channel
      ? { kind: "channel", channel: input.channel }
      : { kind: "transcript" },
    persistent: false,
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
      agent.modelPolicy,
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

  return dedupeSourceIds(out);
}

export async function runContextSource(input: {
  source: ContextSourceView;
  runtime: AppRuntime;
  agentId?: string;
  channel?: string;
  sessionType?: string;
}): Promise<ContextSourceRunResult> {
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
  const parsed = parseContextResource(input.source);
  const rootPath = parsed.scope === "agent" ? input.agentRootPath : input.workspacePath;
  const type = isDirectoryResource(input.source) ? "directory" : "file";
  return {
    id: `${type}:${parsed.scope}:${parsed.path}`,
    type,
    scope: "session",
    origin: input.origin,
    summary: input.source,
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

export function collectContextProducers(input: {
  runtime: AppRuntime;
  agentId?: string;
  channel?: string;
  sessionType?: string;
}): ContextProducerView[] {
  const agent = input.runtime.getAgent(input.agentId);
  const state = readContextState(input.runtime, agent.id);
  const sessionType = input.sessionType
    ?? (input.channel ? "gateway" : "preview");
  const configured = input.runtime.resolved.context.turn.producers.map((producer) => {
    const matched = producerMatchesChannel(producer, input.channel);
    const cached = matched && isProducerFresh(
      state.producers[contextTurnProducerStateKey(
        producer.id,
        input.channel,
        sessionType,
      )],
      producer.cacheMs,
    );
    return {
      id: producer.id,
      type: "command",
      scope: "turn",
      origin: "configured",
      summary: producer.run,
      matched,
      status: matched ? (cached ? "cached" : "matched") : "skipped",
      ...(!matched
        ? {
          reason: input.channel
            ? `channel "${input.channel}" did not match when.channels`
            : "channel-scoped producer does not match a channel-less session",
        }
        : {}),
      producer,
    } satisfies ContextProducerView;
  });

  return [
    ...configured,
    {
      id: "runtime:turn-context",
      type: "runtime",
      scope: "turn",
      origin: "runtime",
      summary: "built-in turn context producers",
      matched: true,
      status: "matched",
    },
  ];
}

export async function runContextProducer(
  input: {
    source: ContextProducerView;
    runtime: AppRuntime;
    agentId?: string;
    channel?: string;
    sessionType?: string;
  },
): Promise<ContextProducerRunResult> {
  const agent = input.runtime.getAgent(input.agentId);
  const sessionType = input.sessionType
    ?? (input.channel ? "gateway" : "preview");

  if (input.source.producer) {
    return runConfiguredContextProducer(input.source.producer, {
      runtime: input.runtime,
      agentId: agent.id,
      channel: input.channel,
      sessionType,
    });
  }

  const preview = await buildContextTurnPreview(input.runtime, {
    agentId: agent.id,
    channel: input.channel,
    sessionType,
  });
  return {
    output: preview.text,
    report: {
      id: input.source.id,
      matched: true,
      status: "ran",
    },
  };
}

async function runConfiguredContextProducer(
  producer: ResolvedContextTurnProducer,
  input: {
    runtime: AppRuntime;
    agentId: string;
    channel?: string;
    sessionType: string;
  },
): Promise<ContextProducerRunResult> {
  if (!producerMatchesChannel(producer, input.channel)) {
    return {
      output: "",
      report: {
        id: producer.id,
        matched: false,
        status: "skipped",
        reason: input.channel
          ? `channel "${input.channel}" did not match when.channels`
          : "channel-scoped producer does not match a channel-less session",
      },
    };
  }
  const result = await runContextTurnProducer(producer, {
    runtime: input.runtime,
    agentId: input.agentId,
    channel: input.channel,
    sessionType: input.sessionType,
  });
  return {
    output: result.raw,
    items: result.items,
    error: result.error,
    report: {
      id: producer.id,
      matched: true,
      status: result.error ? "failed" : "ran",
      ...(result.error ? { reason: result.error } : {}),
    },
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
