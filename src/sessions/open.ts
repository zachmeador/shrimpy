import { join } from "node:path";
import type { Api, Model } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  createAgentSessionRuntime,
  type AgentSession,
  type AgentSessionRuntime,
  type ModelRegistry,
  type ResourceLoader,
  type SettingsManager,
  type SessionManager,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { projectRoot } from "../app/project-root.js";
import { isPromptAlreadyPrepared } from "../context/index.js";
import {
  resolveModelVariantInference,
  type ModelVariantInference,
} from "../inference/params.js";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  resolveSessionCompactionPolicy,
  type EffectiveCompactionPolicy,
} from "./compaction-policy.js";
import { createInlineSettingsManager } from "./inline-settings.js";
import { createShrimpyResourceLoader } from "./pi-resources.js";
import { assembleSessionPrompt } from "./prompt.js";
import type { SessionOpenPlan } from "./spec.js";
import { createSessionManager } from "./storage.js";

type CompactionLogEvent =
  | { type: "compaction_start"; reason?: string }
  | {
    type: "compaction_end";
    reason?: string;
    aborted?: boolean;
    errorMessage?: string;
    result?: { tokensBefore?: number };
    willRetry?: boolean;
  };

interface SessionMetadata {
  workspacePath: string;
  agentId: string;
  sessionType: string;
  channel?: string;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
  inference?: ModelVariantInference;
  toolPolicy?: {
    excludedToolNames?: string[];
  };
}

export async function openSession(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
): Promise<AgentSession> {
  const result = await openSessionWithRuntimeDeps(bootstrap, plan);
  return result.session;
}

export async function openSessionRuntime(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
): Promise<AgentSessionRuntime> {
  const cwd = plan.descriptor.cwd ?? bootstrap.agentRootPath;
  const agentDir = join(projectRoot, ".shrimpy");

  return createAgentSessionRuntime(
    async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
      const { session, resourceLoader } = await openSessionWithRuntimeDeps(
        bootstrap,
        {
          ...plan,
          descriptor: {
            ...plan.descriptor,
            cwd,
          },
        },
        {
          sessionManager,
          sessionStartEvent,
        },
      );

      return {
        session,
        extensionsResult: resourceLoader.getExtensions(),
        services: {
          cwd,
          agentDir,
          authStorage: bootstrap.authStorage,
          settingsManager: bootstrap.settingsManager,
          modelRegistry: bootstrap.modelRegistry,
          resourceLoader,
          diagnostics: [],
        },
        diagnostics: [],
      };
    },
    {
      cwd,
      agentDir,
      sessionManager: createSessionManager(cwd, plan.descriptor.sessionDir),
    },
  );
}

async function openSessionWithRuntimeDeps(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
  opts?: {
    sessionManager?: SessionManager;
    sessionStartEvent?: SessionStartEvent;
  },
): Promise<{
  session: AgentSession;
  resourceLoader: ResourceLoader;
}> {
  if (plan.defaultThinking !== undefined) {
    bootstrap.settingsManager.setDefaultThinkingLevel(plan.defaultThinking);
  }

  const cwd = plan.descriptor.cwd ?? bootstrap.agentRootPath;
  const sessionManager =
    opts?.sessionManager ??
      createSessionManager(cwd, plan.descriptor.sessionDir);
  const modelPlan = resolveSessionModelPlan({
    bootstrap,
    plan,
    sessionManager,
  });
  if (!modelPlan.model && !modelPlan.allowMissingModel) {
    throw new Error(
      `session ${modelPlan.descriptor.channel ?? modelPlan.descriptor.kind} has no model. `
      + `Set a default for agent ${modelPlan.descriptor.agentId ?? bootstrap.agentId}.`,
    );
  }
  const assembly = assembleSessionPrompt(bootstrap, modelPlan);
  const effectivePlan: SessionOpenPlan = {
    ...modelPlan,
    model: assembly.resolvedModel,
    inference: resolveEffectiveInference({
      bootstrap,
      originalPlan: plan,
      model: assembly.resolvedModel,
    }),
  };
  const compactionPolicy = resolveSessionCompactionPolicy({
    runtimeConfig: bootstrap.runtimeConfig,
    descriptor: effectivePlan.descriptor,
    model: assembly.resolvedModel,
  });
  const settingsManager = createInlineSettingsManager({
    theme: bootstrap.runtimeConfig.theme,
    quietStartup: bootstrap.runtimeConfig.quietStartup,
    compaction: {
      enabled: compactionPolicy.enabled,
      reserveTokens: compactionPolicy.reserveTokens,
      keepRecentTokens: compactionPolicy.keepRecentTokens,
    },
  });
  if (plan.defaultThinking !== undefined) {
    settingsManager.setDefaultThinkingLevel(plan.defaultThinking);
  }
  const resourceLoader = await resolveSessionResourceLoader(
    bootstrap,
    assembly,
    settingsManager,
  );

  const { session } = await createAgentSession({
    settingsManager,
    sessionManager,
    resourceLoader,
    authStorage: bootstrap.authStorage,
    modelRegistry: bootstrap.modelRegistry,
    model: assembly.resolvedModel,
    thinkingLevel: effectivePlan.thinking,
    customTools: effectivePlan.tools,
    excludeTools: effectivePlan.toolPolicy?.excludedToolNames,
    sessionStartEvent: opts?.sessionStartEvent,
    cwd: assembly.cwd,
  });

  if (effectivePlan.thinking !== undefined) {
    session.setThinkingLevel(effectivePlan.thinking);
  }

  recordSessionOpen({
    session,
    sessionManager,
    bootstrap,
    plan: effectivePlan,
    envKeys: assembly.envKeys,
    env: assembly.env,
    compaction: compactionPolicy,
  });
  wrapModelMetadataRecording({
    session,
    sessionManager,
    bootstrap,
    plan: effectivePlan,
    envKeys: assembly.envKeys,
    env: assembly.env,
    compaction: compactionPolicy,
  });
  wrapPromptPreparation(session, effectivePlan);
  subscribeToCompactionLogs(session, effectivePlan);

  return { session, resourceLoader };
}

function resolveSessionModelPlan(input: {
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  sessionManager: SessionManager;
}): SessionOpenPlan {
  if (!input.plan.restoreModelFromSession) return input.plan;

  const restoredModel = resolveStoredSessionModel(
    input.sessionManager,
    input.bootstrap.modelRegistry,
  );
  if (!restoredModel) return input.plan;

  return {
    ...input.plan,
    model: restoredModel,
    inference: resolveModelVariantInference({
      modelsPath: input.bootstrap.modelsPath,
      model: restoredModel,
    }),
  };
}

function resolveStoredSessionModel(
  sessionManager: SessionManager,
  modelRegistry: ModelRegistry,
): Model<Api> | undefined {
  const saved = sessionManager.buildSessionContext().model;
  if (!saved) return undefined;

  const model = modelRegistry.find(saved.provider, saved.modelId);
  if (!model || !modelRegistry.hasConfiguredAuth(model)) return undefined;
  return model;
}

function resolveEffectiveInference(input: {
  bootstrap: SessionBootstrap;
  originalPlan: SessionOpenPlan;
  model?: Model<Api>;
}): ModelVariantInference | undefined {
  if (sameModelIdentity(input.originalPlan.model, input.model)) {
    return input.originalPlan.inference ??
      resolveModelVariantInference({
        modelsPath: input.bootstrap.modelsPath,
        model: input.model,
      });
  }

  return resolveModelVariantInference({
    modelsPath: input.bootstrap.modelsPath,
    model: input.model,
  });
}

function sameModelIdentity(
  left: Model<Api> | undefined,
  right: Model<Api> | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.provider === right.provider && left.id === right.id;
}

async function resolveSessionResourceLoader(
  bootstrap: SessionBootstrap,
  assembly: ReturnType<typeof assembleSessionPrompt>,
  settingsManager: SettingsManager,
): Promise<ResourceLoader> {
  if (!assembly.needsCustomLoader) {
    return bootstrap.resourceLoader;
  }

  const resourceLoader = createShrimpyResourceLoader({
    cwd: assembly.cwd,
    settingsManager,
    runtimeConfig: bootstrap.runtimeConfig,
    systemPrompt: assembly.systemPrompt,
    modelsPath: bootstrap.modelsPath,
    skillPaths: bootstrap.skillEntryPaths,
  });
  await resourceLoader.reload();
  return resourceLoader;
}

function recordSessionOpen(input: {
  session: AgentSession;
  sessionManager: SessionManager;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
}): void {
  const { session, sessionManager, bootstrap, plan } = input;

  // Record the resolved system prompt and tool definitions at session open so
  // the session JSONL is self-contained. Pi ignores custom entries when
  // building LLM context, so these are inspection-only records.
  sessionManager.appendCustomEntry(
    "shrimpy_system_prompt",
    session.systemPrompt,
  );
  sessionManager.appendCustomEntry(
    "shrimpy_tools",
    session.getAllTools(),
  );

  appendSessionMetadata({
    sessionManager,
    bootstrap,
    plan,
    envKeys: input.envKeys,
    env: input.env,
    compaction: input.compaction,
    model: session.model,
  });
  sessionManager.appendCustomEntry("shrimpy_compaction_policy", input.compaction);
}

function appendSessionMetadata(input: {
  sessionManager: SessionManager;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
  model?: Model<Api>;
}): void {
  const { sessionManager, bootstrap, plan, model } = input;
  const inference = sameModelIdentity(plan.model, model)
    ? plan.inference ?? resolveModelVariantInference({
      modelsPath: bootstrap.modelsPath,
      model,
    })
    : resolveModelVariantInference({
      modelsPath: bootstrap.modelsPath,
      model,
    });
  const env = {
    ...input.env,
    ...(model
      ? {
        provider: model.provider,
        model_id: model.id,
      }
      : {}),
  };
  const metadata: SessionMetadata = {
    workspacePath: bootstrap.workspacePath,
    agentId: plan.descriptor.agentId ?? bootstrap.agentId,
    sessionType: plan.descriptor.kind,
    channel: plan.descriptor.channel,
    envKeys: input.envKeys,
    env,
    compaction: input.compaction,
    inference,
    toolPolicy: plan.toolPolicy,
  };
  sessionManager.appendCustomEntry("shrimpy_session_metadata", metadata);
}

function wrapModelMetadataRecording(input: {
  session: AgentSession;
  sessionManager: SessionManager;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
}): void {
  const { session } = input;
  const originalSetModel = session.setModel.bind(session);
  session.setModel = async (model) => {
    await originalSetModel(model);
    appendSessionMetadata({
      ...input,
      model: session.model,
    });
  };

  const originalCycleModel = session.cycleModel.bind(session);
  session.cycleModel = async (direction) => {
    const result = await originalCycleModel(direction);
    if (result) {
      appendSessionMetadata({
        ...input,
        model: session.model,
      });
    }
    return result;
  };
}

function wrapPromptPreparation(
  session: AgentSession,
  plan: SessionOpenPlan,
): void {
  // Wrap session.prompt once so direct runs and Pi's InteractiveMode can use
  // the same briefing prefix path as routed sessions. Slash commands stay raw
  // so Pi can intercept them before normal prompt handling.
  const originalPrompt = session.prompt.bind(session);
  session.prompt = async (text, options) => {
    const prepared = plan.preparePrompt && !isPromptAlreadyPrepared(text)
      ? await plan.preparePrompt(text)
      : text;
    return originalPrompt(prepared, options);
  };
}

function subscribeToCompactionLogs(
  session: AgentSession,
  plan: SessionOpenPlan,
): void {
  const sessionLabel = plan.descriptor.channel ?? plan.descriptor.kind;
  session.subscribe((event: unknown) => {
    if (!isCompactionLogEvent(event)) return;
    if (event.type === "compaction_start") {
      console.log(
        `[compaction:${sessionLabel}] start reason=${event.reason}`,
      );
    } else if (event.type === "compaction_end") {
      const status = event.aborted
        ? "aborted"
        : event.errorMessage
          ? `failed (${event.errorMessage})`
          : "ok";
      const tokensBefore = event.result?.tokensBefore;
      console.log(
        `[compaction:${sessionLabel}] end reason=${event.reason} status=${status}`
        + (tokensBefore !== undefined ? ` tokensBefore=${tokensBefore}` : "")
        + (event.willRetry ? " willRetry=true" : ""),
      );
    }
  });
}

function isCompactionLogEvent(event: unknown): event is CompactionLogEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (event.type === "compaction_start" || event.type === "compaction_end")
  );
}
