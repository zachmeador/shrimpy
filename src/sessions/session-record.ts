import type { Api, Model } from "@earendil-works/pi-ai";
import type {
  AgentSession,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import {
  formatModelRef,
  sameModelRef,
  toModelRef,
  type ModelRef,
} from "../config/model.js";
import type { SessionBootstrap } from "./bootstrap.js";
import type { EffectiveCompactionPolicy } from "./compaction-policy.js";
import type { ModelResolution } from "./models.js";
import type { SessionOpenPlan } from "./spec.js";

interface SessionMetadata {
  workspacePath: string;
  agentId: string;
  sessionType: string;
  channel?: string;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
  toolPolicy?: {
    excludedToolNames?: string[];
  };
  modelResolution?: SessionModelResolutionMetadata;
}

interface SessionModelResolutionMetadata {
  source: ModelResolution["source"];
  model?: ModelRef;
  policy?: {
    name: string;
    source: string;
    candidates: Array<{
      provider: string;
      id: string;
      usable: boolean;
      selected?: boolean;
      reason?: string;
    }>;
    selected?: ModelRef;
    problems: string[];
  };
  problems: string[];
}

interface ModelSwitchMessageDetails {
  source: "set" | "cycle";
  previous?: ModelRef;
  current?: ModelRef;
  thinkingLevel?: string;
}

const MODEL_SWITCH_CUSTOM_TYPE = "shrimpy_model_switch";

export function recordSessionOpen(input: {
  session: AgentSession;
  sessionManager: SessionManager;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
}): void {
  const { session, sessionManager, bootstrap, plan } = input;

  // Pi ignores custom entries when building LLM context; these make the JSONL
  // self-contained for inspection and restore diagnostics.
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

export function wrapModelMetadataRecording(input: {
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
    const previousModel = session.model;
    await originalSetModel(model);
    appendSessionMetadata({
      ...input,
      model: session.model,
      modelResolution: createSessionSwitchModelResolution(session.model),
    });
    await appendModelSwitchMessage({
      ...input,
      previousModel,
      currentModel: session.model,
      source: "set",
    });
  };

  const originalCycleModel = session.cycleModel.bind(session);
  session.cycleModel = async (direction) => {
    const previousModel = session.model;
    const result = await originalCycleModel(direction);
    if (result) {
      appendSessionMetadata({
        ...input,
        model: session.model,
        modelResolution: createSessionSwitchModelResolution(session.model),
      });
      await appendModelSwitchMessage({
        ...input,
        previousModel,
        currentModel: session.model,
        source: "cycle",
      });
    }
    return result;
  };
}

function appendSessionMetadata(input: {
  sessionManager: SessionManager;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  envKeys: string[];
  env: Record<string, string>;
  compaction: EffectiveCompactionPolicy;
  model?: Model<Api>;
  modelResolution?: ModelResolution;
}): void {
  const { sessionManager, bootstrap, plan, model } = input;
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
    toolPolicy: plan.toolPolicy,
    modelResolution: serializeModelResolution(input.modelResolution ?? plan.modelResolution),
  };
  sessionManager.appendCustomEntry("shrimpy_session_metadata", metadata);
}

async function appendModelSwitchMessage(input: {
  session: AgentSession;
  bootstrap: SessionBootstrap;
  plan: SessionOpenPlan;
  previousModel?: Model<Api>;
  currentModel?: Model<Api>;
  source: ModelSwitchMessageDetails["source"];
}): Promise<void> {
  if (sameModelRef(input.previousModel, input.currentModel)) return;

  const thinkingLevel = typeof input.session.thinkingLevel === "string"
    ? input.session.thinkingLevel
    : undefined;
  const details: ModelSwitchMessageDetails = {
    source: input.source,
    previous: toModelRef(input.previousModel),
    current: toModelRef(input.currentModel),
    thinkingLevel,
  };

  await input.session.sendCustomMessage({
    customType: MODEL_SWITCH_CUSTOM_TYPE,
    content: formatModelSwitchMessage({
      previousModel: input.previousModel,
      currentModel: input.currentModel,
      thinkingLevel,
    }),
    display: true,
    details,
  });
}

function formatModelSwitchMessage(input: {
  previousModel?: Model<Api>;
  currentModel?: Model<Api>;
  thinkingLevel?: string;
}): string {
  const current = formatModelRef(input.currentModel);
  const previous = input.previousModel
    ? formatModelRef(input.previousModel)
    : "no active model";
  const thinking = input.thinkingLevel
    ? ` Thinking: ${input.thinkingLevel}.`
    : "";
  return `[session runtime] Model switched: ${previous} -> ${current}.`
    + `${thinking} Earlier assistant messages may be from ${previous}.`;
}

function createSessionSwitchModelResolution(model: Model<Api> | undefined): ModelResolution {
  return {
    source: model ? "session-switch" : "missing",
    model,
    modelRef: toModelRef(model),
    policy: model
      ? {
        name: "session-switch",
        source: "default",
        candidates: [{
          provider: model.provider,
          id: model.id,
          usable: true,
          selected: true,
        }],
        selected: {
          provider: model.provider,
          id: model.id,
        },
        problems: [],
      }
      : undefined,
    problems: model ? [] : ["session has no active model"],
  };
}

function serializeModelResolution(
  resolution: ModelResolution | undefined,
): SessionModelResolutionMetadata | undefined {
  if (!resolution) return undefined;
  return {
    source: resolution.source,
    model: resolution.modelRef,
    policy: resolution.policy
      ? {
        name: resolution.policy.name,
        source: resolution.policy.source,
        candidates: resolution.policy.candidates,
        selected: resolution.policy.selected,
        problems: resolution.policy.problems,
      }
      : undefined,
    problems: resolution.problems,
  };
}
