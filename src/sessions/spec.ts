import type { Api, Model } from "@earendil-works/pi-ai";
import { join } from "node:path";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { PromptResourceRef } from "../context/index.js";
import type { ModelVariantInference } from "../inference/params.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import type { SessionToolPolicy } from "../tools/policy.js";
import type {
  ModelResolution,
  SessionModelRequest,
} from "./models.js";
import type { PrepareSessionTurnContext } from "./turn-context.js";

export interface SessionDescriptor {
  agentId?: string;
  kind: string;
  channel?: string;
  sessionDir: string;
  cwd?: string;
}

export interface SessionOpenPlan {
  descriptor: SessionDescriptor;
  model?: Model<Api>;
  modelResolution?: ModelResolution;
  modelRequest?: SessionModelRequest;
  inference?: ModelVariantInference;
  restoreModelFromSession?: boolean;
  allowMissingModel?: boolean;
  thinking?: ThinkingLevel;
  defaultThinking?: ThinkingLevel;
  tools?: ToolDefinition[];
  toolPolicy?: SessionToolPolicy;
  prompt?: {
    appendSystemPrompt?: string;
    skills?: string[];
    extraResources?: PromptResourceRef[];
  };
  prepareTurnContext?: PrepareSessionTurnContext;
}

export function sanitizeSessionSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function createGatewaySessionDescriptor(opts: {
  workspacePath: string;
  agentId?: string;
  channel: string;
  cwd?: string;
}): SessionDescriptor {
  return {
    agentId: opts.agentId,
    kind: "gateway",
    channel: opts.channel,
    sessionDir: join(
      opts.workspacePath,
      "sessions",
      sanitizeSessionSegment(opts.channel),
    ),
    cwd: opts.cwd,
  };
}

export function createLocalSessionDescriptor(opts: {
  workspacePath: string;
  agentId?: string;
  label: string;
  kind: string;
  channel?: string;
  cwd?: string;
}): SessionDescriptor {
  return {
    agentId: opts.agentId,
    kind: opts.kind,
    channel: opts.channel,
    sessionDir: join(
      opts.workspacePath,
      "sessions",
      sanitizeSessionSegment(opts.label),
    ),
    cwd: opts.cwd,
  };
}

export function createStoredSessionDescriptor(opts: {
  workspacePath: string;
  sessionName: string;
  kind: string;
  agentId?: string;
  channel?: string;
  cwd?: string;
}): SessionDescriptor {
  return {
    agentId: opts.agentId,
    kind: opts.kind,
    channel: opts.channel,
    sessionDir: join(opts.workspacePath, "sessions", opts.sessionName),
    cwd: opts.cwd,
  };
}
