import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelMessage } from "../../channels/protocol.js";
import type { SessionDescriptor } from "../../sessions/spec.js";

export interface TurnContextItem {
  id: string;
  summary: string;
  inspect?: string;
}

export type TurnProducerStatus = "matched" | "ran" | "cached" | "failed" | "skipped";

export interface TurnProducerReport {
  id: string;
  matched: boolean;
  status: TurnProducerStatus;
  reason?: string;
}

export interface TurnContext {
  agentId: string;
  channel?: string;
  sessionType: string;
  capturedAt: string;
  maxChars: number;
  items: TurnContextItem[];
  producers?: TurnProducerReport[];
}

export interface TurnContextInput {
  runtime: AppRuntime;
  descriptor: SessionDescriptor;
  currentMessage?: ChannelMessage;
  currentPrompt?: string;
  preview?: boolean;
}
