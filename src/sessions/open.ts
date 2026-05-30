import { join } from "node:path";
import {
  createAgentSession,
  createAgentSessionRuntime,
  type AgentSession,
  type AgentSessionRuntime,
  type ResourceLoader,
  type SettingsManager,
  type SessionManager,
  type SessionStartEvent,
} from "@earendil-works/pi-coding-agent";
import { projectRoot } from "../app/project-root.js";
import { isPromptAlreadyPrepared } from "../context/index.js";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  resolveSessionCompactionPolicy,
  type EffectiveCompactionPolicy,
} from "./compaction-policy.js";
import { createInlineSettingsManager } from "./inline-settings.js";
import { createShrimpyResourceLoader } from "./pi-resources.js";
import { assembleSessionPrompt } from "./prompt.js";
import type { SessionOpenPlan } from "./spec.js";
import type { ModelVariantInference } from "../inference/params.js";
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

  const assembly = assembleSessionPrompt(bootstrap, plan);
  const compactionPolicy = resolveSessionCompactionPolicy({
    runtimeConfig: bootstrap.runtimeConfig,
    descriptor: plan.descriptor,
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
    plan,
  );

  const sessionManager =
    opts?.sessionManager ??
      createSessionManager(assembly.cwd, plan.descriptor.sessionDir);
  const { session } = await createAgentSession({
    settingsManager,
    sessionManager,
    resourceLoader,
    authStorage: bootstrap.authStorage,
    modelRegistry: bootstrap.modelRegistry,
    model: assembly.resolvedModel,
    thinkingLevel: plan.thinking,
    customTools: plan.tools,
    sessionStartEvent: opts?.sessionStartEvent,
    cwd: assembly.cwd,
  });

  if (plan.thinking !== undefined) {
    session.setThinkingLevel(plan.thinking);
  }

  recordSessionOpen({
    session,
    sessionManager,
    bootstrap,
    plan,
    envKeys: assembly.envKeys,
    env: assembly.env,
    compaction: compactionPolicy,
  });
  wrapPromptPreparation(session, plan);
  subscribeToCompactionLogs(session, plan);

  return { session, resourceLoader };
}

async function resolveSessionResourceLoader(
  bootstrap: SessionBootstrap,
  assembly: ReturnType<typeof assembleSessionPrompt>,
  settingsManager: SettingsManager,
  plan: SessionOpenPlan,
): Promise<ResourceLoader> {
  if (!assembly.needsCustomLoader && plan.inference === undefined) {
    return bootstrap.resourceLoader;
  }

  const resourceLoader = createShrimpyResourceLoader({
    cwd: assembly.cwd,
    settingsManager,
    runtimeConfig: bootstrap.runtimeConfig,
    systemPrompt: assembly.systemPrompt,
    inference: plan.inference,
    model: assembly.resolvedModel,
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

  const metadata: SessionMetadata = {
    workspacePath: bootstrap.workspacePath,
    agentId: plan.descriptor.agentId ?? bootstrap.agentId,
    sessionType: plan.descriptor.kind,
    channel: plan.descriptor.channel,
    envKeys: input.envKeys,
    env: input.env,
    compaction: input.compaction,
    inference: plan.inference,
  };
  sessionManager.appendCustomEntry("shrimpy_session_metadata", metadata);
  sessionManager.appendCustomEntry("shrimpy_compaction_policy", input.compaction);
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
