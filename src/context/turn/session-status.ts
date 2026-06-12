import {
  formatSessionAge,
  summarizeSessionStatus,
} from "../../sessions/status.js";
import type { TurnContextInput, TurnContextItem } from "./types.js";
import { buildWorkerSessionStatusItems } from "./workers.js";

export function isGeneratedWakeTurn(input: TurnContextInput): boolean {
  return input.currentMessage?.origin.transport === "watch";
}

export function buildSessionStatusItems(input: {
  turn: TurnContextInput;
  agentId: string;
}): TurnContextItem[] {
  const config = input.turn.runtime.resolved.context.turn.sessionStatus;
  if (!config.enabled || !isGeneratedWakeTurn(input.turn)) return [];

  const staleAfterMs = config.staleAfterMinutes * 60 * 1000;
  const status = summarizeSessionStatus(input.turn.runtime, {
    agentId: input.agentId,
    staleAfterMs,
  });
  const workerItems = buildWorkerSessionStatusItems({
    runtime: input.turn.runtime,
    agentId: input.agentId,
  });
  if (status.counts.active === 0) return workerItems;

  const pieces = [
    `sessions: ${status.counts.active} active across ${formatChannels(
      status.active.map((session) => session.channel),
    )}`,
  ];
  if (status.mostRecent) {
    pieces.push(
      `most recent ${status.mostRecent.channel} ${formatSessionAge(status.mostRecent.ageMs)} ago`,
    );
  }
  if (status.counts.stale > 0) {
    pieces.push(
      `${status.counts.stale} stale >${formatSessionAge(staleAfterMs)}`,
    );
  }

  return [{
    id: "sessions:status",
    summary: pieces.join("; "),
    inspect: "shrimpy sessions list --json",
  }, ...workerItems];
}

function formatChannels(channels: string[]): string {
  const unique = [...new Set(channels)].slice(0, 5);
  const suffix = channels.length > unique.length
    ? `,+${channels.length - unique.length} more`
    : "";
  return unique.map((channel) => `#${channel}`).join(",") + suffix;
}
