import {
  channelDeliveryGuidance,
  channelTurnDelivery,
  publicationResult,
  readChannelResult,
  sendMessageResult,
  toolParameterInstructions,
  toolProseInstructions,
  transcriptDelivery,
} from "./delivery.js";
import {
  compactionAgentContext,
  compactionChunk,
  compactionIntermediate,
  compactionSummary,
  compactionSummaryInstructions,
  compactionSummarizationSystem,
  compactionTurnPrefix,
  compactionUpdate,
} from "./compaction.js";
import { fallbackIdentity } from "./identity.js";
import { turnContextLeading, turnContextTrailing } from "./turn.js";
import { codingWorkerContract } from "./workers.js";

export * from "./definition.js";
export * from "./identity.js";
export * from "./delivery.js";
export * from "./turn.js";
export * from "./compaction.js";
export * from "./workers.js";

export const productInstructionCatalog = [
  fallbackIdentity,
  channelDeliveryGuidance,
  transcriptDelivery,
  channelTurnDelivery,
  ...Object.values(toolProseInstructions).flatMap(({ description, promptSnippet }) => [
    description,
    promptSnippet,
  ]),
  ...Object.values(toolParameterInstructions),
  sendMessageResult,
  publicationResult,
  readChannelResult,
  turnContextLeading,
  turnContextTrailing,
  compactionSummaryInstructions,
  compactionSummarizationSystem,
  compactionAgentContext,
  compactionSummary,
  compactionUpdate,
  compactionTurnPrefix,
  compactionChunk,
  compactionIntermediate,
  codingWorkerContract,
] as const;
