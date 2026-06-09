import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelMessage } from "../../channels/index.js";
import type { MemoryContext } from "./memory.js";
import type { SessionDescriptor } from "../../sessions/spec.js";

export interface TurnContextItem {
  id: string;
  summary: string;
  inspect?: string;
}

export interface TurnContext {
  agentId: string;
  channel?: string;
  sessionType: string;
  capturedAt: string;
  maxChars: number;
  items: TurnContextItem[];
  memory?: MemoryContext;
}

export interface TurnContextInput {
  runtime: AppRuntime;
  descriptor: SessionDescriptor;
  currentMessage?: ChannelMessage;
  preview?: boolean;
}
