import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelMessage } from "../../channels/protocol.js";
import type { SessionDescriptor } from "../../sessions/spec.js";

export interface TurnContextItem {
  id: string;
  summary: string;
  inspect?: string;
  revision?: string;
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
  deliveryState?: TurnContextDeliveryState;
}

export interface TurnContextDeliveryState {
  sessionId: string;
  activityCursor?: number;
  activityBaseCursor?: number;
  activityItemSequences?: number[];
  seenItems: Record<string, string>;
}

export interface TurnContextInput {
  runtime: AppRuntime;
  descriptor: SessionDescriptor;
  sessionInstanceId?: string;
  currentMessage?: ChannelMessage;
  currentPrompt?: string;
  preview?: boolean;
}
