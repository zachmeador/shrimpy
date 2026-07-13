import type { Api, Model } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { PromptResourceRef } from "../context/index.js";
import type { ThinkingLevel } from "../thinking.js";
import type { SessionToolPolicy } from "../tools/policy.js";
import type {
  ModelResolution,
  SessionModelRequest,
} from "./models.js";
import type { PrepareSessionTurnContext } from "./turn-context.js";
import type { SessionKey } from "./identity.js";
import { sessionRootPath } from "./identity.js";

export type SessionDelivery =
  | { kind: "transcript" }
  | { kind: "channel"; channel: string };

export type SessionStorage =
  | { kind: "durable"; dir: string }
  | { kind: "memory" };

export interface SessionDescriptor {
  key: SessionKey;
  purpose: string;
  delivery: SessionDelivery;
  storage: SessionStorage;
  cwd?: string;
}

export interface SessionOpenPlan {
  descriptor: SessionDescriptor;
  model?: Model<Api>;
  modelResolution?: ModelResolution;
  modelRequest?: SessionModelRequest;
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

export function createSessionDescriptor(opts: {
  agentRoot: string;
  key: SessionKey;
  purpose: string;
  delivery: SessionDelivery;
  persistent?: boolean;
  cwd?: string;
}): SessionDescriptor {
  return {
    key: opts.key,
    purpose: opts.purpose,
    delivery: opts.delivery,
    storage: opts.persistent === false
      ? { kind: "memory" }
      : { kind: "durable", dir: sessionRootPath(opts.agentRoot, opts.key) },
    cwd: opts.cwd,
  };
}

export function sessionChannel(descriptor: SessionDescriptor): string | undefined {
  return descriptor.delivery.kind === "channel"
    ? descriptor.delivery.channel
    : undefined;
}

export function durableSessionDir(descriptor: SessionDescriptor): string {
  if (descriptor.storage.kind !== "durable") {
    throw new Error(`session ${descriptor.key.namespace}/${descriptor.key.name} is not durable`);
  }
  return descriptor.storage.dir;
}
