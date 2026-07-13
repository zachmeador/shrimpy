import { join } from "node:path";
import {
  createAgentSession,
  createAgentSessionRuntime,
  type AgentSession,
  type AgentSessionRuntime,
  type ResourceLoader,
  type SettingsManager,
  SessionManager,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { projectRoot } from "../app/project-root.js";
import {
  type ModelRef,
} from "../config/model.js";
import type { SessionBootstrap } from "./bootstrap.js";
import { resolveSessionCompactionPolicy } from "./compaction-policy.js";
import { buildContainedSystemPrompt } from "./contained-system-prompt.js";
import { createInlineSettingsManager } from "./inline-settings.js";
import { createShrimpyResourceLoader } from "./pi-resources.js";
import { assembleSessionPrompt } from "./prompt.js";
import type { SessionOpenPlan } from "./spec.js";
import {
  resolveSavedSessionModel,
  resolveSessionModel,
} from "./models.js";
import {
  recordSessionOpen,
  wrapModelMetadataRecording,
} from "./session-record.js";
import {
  createSessionManager,
  ensureSessionManifest,
} from "./storage.js";
import type { SessionDescriptor } from "./spec.js";
import { formatSessionId } from "./identity.js";
import { acquireSessionLease } from "./ownership.js";
import {
  createSessionTurnContextController,
  type SessionTurnContextController,
} from "./turn-context.js";

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
      sessionManager: createDescriptorSessionManager(cwd, plan.descriptor),
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
  const lease = acquireSessionLease({
    workspace: bootstrap.workspacePath,
    descriptor: plan.descriptor,
  });
  try {
    return await openLeasedSessionWithRuntimeDeps(bootstrap, plan, opts, lease);
  } catch (err) {
    lease?.release();
    throw err;
  }
}

async function openLeasedSessionWithRuntimeDeps(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
  opts: {
    sessionManager?: SessionManager;
    sessionStartEvent?: SessionStartEvent;
  } | undefined,
  lease: ReturnType<typeof acquireSessionLease>,
): Promise<{
  session: AgentSession;
  resourceLoader: ResourceLoader;
}> {
  if (plan.defaultThinking !== undefined) {
    bootstrap.settingsManager.setDefaultThinkingLevel(plan.defaultThinking);
  }

  const cwd = plan.descriptor.cwd ?? bootstrap.agentRootPath;
  const sessionManager = opts?.sessionManager ??
    createDescriptorSessionManager(cwd, plan.descriptor);
  const modelPlan = resolveSessionModelPlan({
    bootstrap,
    plan,
    sessionManager,
  });
  if (!modelPlan.model && !modelPlan.allowMissingModel) {
    const reason = modelPlan.modelResolution?.problems[0];
    throw new Error(
      reason ??
        (
          `session ${formatSessionId(modelPlan.descriptor.key)} has no model. `
          + `Configure a model policy for agent ${modelPlan.descriptor.key.agentId}.`
        ),
    );
  }
  const assembly = assembleSessionPrompt(bootstrap, modelPlan);
  const effectivePlan: SessionOpenPlan = {
    ...modelPlan,
    model: assembly.resolvedModel,
  };
  const compactionPolicy = resolveSessionCompactionPolicy({
    runtimeConfig: bootstrap.runtimeConfig,
    descriptor: effectivePlan.descriptor,
    model: assembly.resolvedModel,
  });
  const turnContextController = createSessionTurnContextController({
    prepare: effectivePlan.prepareTurnContext,
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
    turnContextController,
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
  session.state.systemPrompt = buildContainedSystemPrompt({
    basePrompt: resourceLoader.getSystemPrompt() ?? assembly.baseSystemPrompt,
    cwd: assembly.cwd,
    skills: bootstrap.runtimeConfig.noSkills
      ? []
      : resourceLoader.getSkills().skills,
    selectedTools: session.getActiveToolNames(),
  }).systemPrompt;

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
  subscribeToCompactionLogs(session, effectivePlan);

  if (lease) {
    const dispose = session.dispose.bind(session);
    let released = false;
    session.dispose = () => {
      if (released) return;
      released = true;
      try {
        dispose();
      } finally {
        lease.release();
      }
    };
  }

  return { session, resourceLoader };
}

function resolveSessionModelPlan(input: {
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  sessionManager: SessionManager;
}): SessionOpenPlan {
  if (!input.plan.modelRequest) {
    if (!input.plan.restoreModelFromSession) return input.plan;
    const modelResolution = resolveSavedSessionModel({
      bootstrap: input.bootstrap,
      readSavedModel: () => readStoredSessionModel(input.sessionManager),
    });
    if (!modelResolution?.model) return input.plan;
    return {
      ...input.plan,
      model: modelResolution.model,
      modelResolution,
    };
  }

  const modelResolution = resolveSessionModel({
    bootstrap: input.bootstrap,
    ...input.plan.modelRequest,
    readSavedModel: input.plan.restoreModelFromSession
      ? () => readStoredSessionModel(input.sessionManager)
      : undefined,
  });

  return {
    ...input.plan,
    model: modelResolution.model,
    modelResolution,
  };
}

function readStoredSessionModel(
  sessionManager: SessionManager,
): ModelRef | undefined {
  const saved = sessionManager.buildSessionContext().model;
  if (!saved) return undefined;
  return {
    provider: saved.provider,
    id: saved.modelId,
  };
}

async function resolveSessionResourceLoader(
  bootstrap: SessionBootstrap,
  assembly: ReturnType<typeof assembleSessionPrompt>,
  settingsManager: SettingsManager,
  turnContextController: SessionTurnContextController,
): Promise<ResourceLoader> {
  const resourceLoader = createShrimpyResourceLoader({
    cwd: assembly.cwd,
    settingsManager,
    runtimeConfig: bootstrap.runtimeConfig,
    systemPrompt: assembly.baseSystemPrompt,
    skillPaths: bootstrap.skillEntryPaths,
    turnContextController,
  });
  await resourceLoader.reload();
  return resourceLoader;
}

function subscribeToCompactionLogs(
  session: AgentSession,
  plan: SessionOpenPlan,
): void {
  const sessionLabel = formatSessionId(plan.descriptor.key);
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

function createDescriptorSessionManager(
  cwd: string,
  descriptor: SessionDescriptor,
): SessionManager {
  if (descriptor.storage.kind === "memory") {
    return SessionManager.inMemory(cwd);
  }
  ensureSessionManifest(descriptor);
  return createSessionManager(cwd, descriptor.storage.dir);
}

function isCompactionLogEvent(event: unknown): event is CompactionLogEvent {
  return (
    typeof event === "object" &&
    event !== null &&
    "type" in event &&
    (event.type === "compaction_start" || event.type === "compaction_end")
  );
}
