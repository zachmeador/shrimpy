import { join } from "node:path";
import {
  createAgentSession,
  createAgentSessionRuntime,
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  type CreateAgentSessionRuntimeResult,
  type ExtensionFactory,
  type ResourceLoader,
  SettingsManager,
  SessionManager,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { projectRoot } from "../app/project-root.js";
import { buildContainedSystemPrompt } from "../context/contained-system-prompt.js";
import { assembleSessionPrompt } from "../context/session-prompt.js";
import type { ModelRef } from "../config/model.js";
import type { SessionBootstrap } from "./bootstrap.js";
import { resolveSessionCompactionPolicy } from "./compaction/policy.js";
import { createShrimpyResourceLoader } from "./pi-resources.js";
import type { SessionDescriptor, SessionOpenPlan } from "./spec.js";
import {
  resolveSavedSessionModel,
  resolveSessionModel,
} from "./models.js";
import {
  createSessionRecordingExtensionFactory,
  recordSessionOpen,
} from "./recording.js";
import {
  openSessionManager,
} from "./transcript-store.js";
import {
  ensureSessionManifest,
} from "./manifest.js";
import { formatSessionId } from "./identity.js";
import {
  acquireSessionLease,
  type SessionLease,
} from "./ownership.js";
import {
  createSessionTurnContextController,
  type SessionTurnContextController,
} from "./turn-context.js";

const sessionLeases = new WeakMap<AgentSession, SessionLease>();

export interface SessionRuntimeOpenTarget {
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
}

export type SessionRuntimeFactoryInput = Parameters<CreateAgentSessionRuntimeFactory>[0];

export type OpenSessionRuntimeTarget = (
  target: SessionRuntimeOpenTarget,
  input: SessionRuntimeFactoryInput,
) => Promise<CreateAgentSessionRuntimeResult>;

export type ShrimpySessionRuntimeFactory = (
  input: SessionRuntimeFactoryInput,
  openTarget: OpenSessionRuntimeTarget,
) => Promise<CreateAgentSessionRuntimeResult>;

export async function openSession(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
): Promise<AgentSession> {
  const result = await openSessionWithRuntimeDeps(bootstrap, plan);
  return result.session;
}

export async function openSessionForContextInspection(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
  runtimeModel: Model<Api>,
  sessionManager?: SessionManager,
): Promise<AgentSession> {
  const result = await openSessionWithRuntimeDeps(bootstrap, plan, {
    runtimeModel,
    sessionManager,
  });
  return result.session;
}

export async function openSessionRuntime(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
  opts?: {
    extensionFactories?: ExtensionFactory[];
    runtimeFactory?: ShrimpySessionRuntimeFactory;
  },
): Promise<AgentSessionRuntime> {
  const cwd = plan.descriptor.cwd ?? bootstrap.agentRootPath;
  const agentDir = join(projectRoot, ".shrimpy");

  const openTarget: OpenSessionRuntimeTarget = async (
    target,
    { cwd, agentDir, sessionManager, sessionStartEvent },
  ) => {
      const { session, resourceLoader } = await openSessionWithRuntimeDeps(
        target.bootstrap,
        {
          ...target.plan,
          descriptor: {
            ...target.plan.descriptor,
            cwd,
          },
        },
        {
          sessionManager,
          sessionStartEvent,
          extensionFactories: opts?.extensionFactories,
        },
      );

      return {
        session,
        extensionsResult: resourceLoader.getExtensions(),
        services: {
          cwd,
          agentDir,
          modelRuntime: target.bootstrap.modelRuntime,
          settingsManager: target.bootstrap.settingsManager,
          resourceLoader,
          diagnostics: [],
        },
        diagnostics: [],
      };
  };
  const runtime = await createAgentSessionRuntime(
    (factoryInput) => opts?.runtimeFactory
      ? opts.runtimeFactory(factoryInput, openTarget)
      : openTarget({ bootstrap, plan }, factoryInput),
    {
      cwd,
      agentDir,
      sessionManager: createDescriptorSessionManager(cwd, plan.descriptor),
    },
  );
  return runtime;
}

export function disposeSession(session: AgentSession): void {
  try {
    session.dispose();
  } finally {
    releaseSessionLease(session);
  }
}

async function openSessionWithRuntimeDeps(
  bootstrap: SessionBootstrap,
  plan: SessionOpenPlan,
  opts?: {
    sessionManager?: SessionManager;
    sessionStartEvent?: SessionStartEvent;
    extensionFactories?: ExtensionFactory[];
    runtimeModel?: Model<Api>;
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
    extensionFactories?: ExtensionFactory[];
    runtimeModel?: Model<Api>;
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
    prepare: effectivePlan.prepareTurnContext
      ? (prompt, images) =>
        effectivePlan.prepareTurnContext?.(
          prompt,
          images,
          sessionManager.getSessionId(),
        )
      : undefined,
  });
  const settingsManager = SettingsManager.inMemory({
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
    [
      createSessionRecordingExtensionFactory({
        sessionManager,
        bootstrap,
        plan: effectivePlan,
        envKeys: assembly.envKeys,
        env: assembly.env,
        compaction: compactionPolicy,
      }),
      ...(opts?.extensionFactories ?? []),
      ...(lease ? [createSessionLeaseExtensionFactory(lease)] : []),
    ],
  );

  const { session } = await createAgentSession({
    settingsManager,
    sessionManager,
    resourceLoader,
    modelRuntime: bootstrap.modelRuntime,
    model: opts?.runtimeModel ?? assembly.resolvedModel,
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
  subscribeToCompactionLogs(session, effectivePlan);

  if (lease) sessionLeases.set(session, lease);

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
  extensionFactories: ExtensionFactory[],
): Promise<ResourceLoader> {
  const resourceLoader = createShrimpyResourceLoader({
    cwd: assembly.cwd,
    settingsManager,
    modelRuntime: bootstrap.modelRuntime,
    runtimeConfig: bootstrap.runtimeConfig,
    systemPrompt: assembly.baseSystemPrompt,
    skillPaths: bootstrap.skillEntryPaths,
    turnContextController,
    extensionFactories,
  });
  await resourceLoader.reload();
  return resourceLoader;
}

function subscribeToCompactionLogs(
  session: AgentSession,
  plan: SessionOpenPlan,
): void {
  const sessionLabel = formatSessionId(plan.descriptor.key);
  session.subscribe((event: AgentSessionEvent) => {
    if (event.type !== "compaction_start" && event.type !== "compaction_end") return;
    if (event.type === "compaction_start") {
      console.log(
        `[compaction:${sessionLabel}] start reason=${event.reason}`,
      );
    } else {
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
  return openSessionManager(cwd, descriptor.storage.dir);
}

function releaseSessionLease(session: AgentSession): void {
  const lease = sessionLeases.get(session);
  if (!lease) return;
  sessionLeases.delete(session);
  lease.release();
}

function createSessionLeaseExtensionFactory(
  lease: SessionLease,
): ExtensionFactory {
  return (pi) => {
    pi.on("session_shutdown", () => {
      lease.release();
    });
  };
}
