import type { AppRuntime } from "../app/runtime.js";
import {
  makeMessage,
  textContent,
} from "../channels/index.js";
import {
  createSessionDescriptor,
  sessionChannel,
  type SessionDescriptor,
} from "../sessions/spec.js";
import { SessionResolver } from "../sessions/resolver.js";
import {
  cloneSessionManagerForContextInspection,
  inspectSessionContext,
  type SessionContextView,
  type ContextToolSchema,
} from "../sessions/context-inspection.js";
import {
  createChannelSessionKey,
  createLocalSessionKey,
  formatSessionId,
} from "../sessions/identity.js";
import { resolveSessionDescriptor } from "../sessions/catalog.js";
import {
  assembleSessionPrompt,
  type SessionPromptAssembly,
} from "./session-prompt.js";
import { buildContainedSystemPrompt } from "./contained-system-prompt.js";
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
  prefixPromptWithTurnContext,
} from "./turn/prompt-prefix.js";
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

export interface ContextPreviewTarget {
  agentId: string;
  descriptor: SessionDescriptor;
  sourceDescriptor?: SessionDescriptor;
  sessionId: string;
  sessionType: string;
  cwd: string;
}

export interface SessionContextPreview {
  target: ContextPreviewTarget;
  assembly: SessionPromptAssembly;
  selectedSkills: string[];
  activeTools: ContextToolSchema[];
  context: SessionContextView;
  historyMessageCount: number;
  turnContext?: TurnContext;
  turnContextText?: string;
  inputMessage?: string;
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
    session?: string;
    sessionType?: string;
    cwd?: string;
  },
): ContextPreviewTarget {
  const agent = runtime.getAgent(input.agentId);
  const agentPaths = runtime.getAgentPaths(agent.id);
  const sourceDescriptor = input.session
    ? resolveSessionDescriptor(runtime, agent.id, input.session)
    : undefined;
  const cwd = input.cwd
    ?? sourceDescriptor?.cwd
    ?? runtime.getAgentCwd(agent.id);
  const sessionType = input.sessionType
    ?? sourceDescriptor?.purpose
    ?? (input.channel ? "gateway" : "preview");
  const descriptor = sourceDescriptor
    ? {
      ...sourceDescriptor,
      purpose: sessionType,
      storage: { kind: "memory" } as const,
      cwd,
    }
    : createSessionDescriptor({
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
    sourceDescriptor,
    sessionId: formatSessionId(descriptor.key),
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
    session?: string;
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
  const channelBus = runtime.createChannelBus({
    egressRegistry: runtime.createCliEgressRegistry(),
  });
  const resolver = new SessionResolver({
    runtime,
    bootstrap,
    channelBus,
    agentId: target.agentId,
  });
  const inspectionSessionManager = target.sourceDescriptor
    ? cloneSessionManagerForContextInspection(target.sourceDescriptor, target.cwd)
    : undefined;
  const plan = await resolver.resolve({
    key: target.descriptor.key,
    purpose: target.sessionType,
    delivery: target.descriptor.delivery,
    persistent: Boolean(target.sourceDescriptor),
    cwd: target.cwd,
    provider: input.provider,
    model: input.model,
    thinking: agent.thinking,
    skills: input.skill ? [input.skill] : undefined,
    allowMissingModel: true,
  });
  plan.descriptor = target.descriptor;
  const prompt = input.prompt ?? "";
  const channel = sessionChannel(target.descriptor);
  const previewMessage = makeContextPreviewMessage(channel, prompt);
  const inputMessage = prompt
    ? previewMessage && channel
      ? formatChannelMessage(channel, previewMessage)
      : prompt
    : undefined;
  const turnContext = input.includeTurn
    ? await buildTurnContext({
      runtime,
      descriptor: target.descriptor,
      currentMessage: previewMessage,
      currentPrompt: prompt,
      preview: true,
    })
    : undefined;
  const turnContextText = turnContext ? renderTurnContext(turnContext) : undefined;
  const channelDelivery = plan.descriptor.delivery.kind === "channel";
  if (channelDelivery) {
    delete plan.prepareTurnContext;
  } else {
    plan.prepareTurnContext = turnContextText
      ? () => turnContextText
      : undefined;
  }
  const inspected = await inspectSessionContext({
    bootstrap,
    plan,
    prompt: inputMessage,
    turnContextText: channelDelivery ? turnContextText : undefined,
    channelDelivery,
    sessionManager: inspectionSessionManager,
  });
  const initialAssembly = assembleSessionPrompt(bootstrap, plan);
  const contained = buildContainedSystemPrompt({
    basePrompt: initialAssembly.baseSystemPrompt,
    cwd: initialAssembly.cwd,
    skills: bootstrap.runtimeConfig.noSkills
      ? []
      : bootstrap.resourceLoader.getSkills().skills,
    selectedTools: inspected.activeToolNames,
  });
  const assembly: SessionPromptAssembly = {
    ...initialAssembly,
    systemPrompt: inspected.context.systemPrompt,
    containedSections: contained.sections,
    sections: [...initialAssembly.baseSections, ...contained.sections],
  };
  const userMessage = inputMessage && turnContextText && channelDelivery
    ? prefixPromptWithTurnContext(inputMessage, turnContextText, {
      channelDelivery: true,
    })
    : inputMessage;

  return {
    target,
    assembly,
    selectedSkills: plan.prompt?.skills ?? [],
    activeTools: inspected.context.tools,
    context: inspected.context,
    historyMessageCount: inspected.historyMessageCount,
    turnContext,
    turnContextText,
    inputMessage,
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
    currentPrompt: input.prompt ?? "",
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
