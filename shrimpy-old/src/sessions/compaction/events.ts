import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

export type SessionCompactionEndEvent = Extract<
  AgentSessionEvent,
  { type: "compaction_end" }
>;

export function isTerminalCompactionFailure(
  event: SessionCompactionEndEvent,
): boolean {
  return !event.aborted &&
    !event.willRetry &&
    Boolean(event.errorMessage?.trim());
}
