import {
  formatSessionAge,
  summarizeSessionStatus,
} from "../../sessions/status.js";
import type { TurnContextInput, TurnContextItem } from "./types.js";

export function isScheduledTurn(input: TurnContextInput): boolean {
  return input.currentMessage?.origin.transport === "scheduler";
}

export function buildSessionStatusItems(input: {
  turn: TurnContextInput;
  agentId: string;
}): TurnContextItem[] {
  const config = input.turn.runtime.resolved.context.turn.sessionStatus;
  if (!config.enabled || !isScheduledTurn(input.turn)) return [];

  const staleAfterMs = config.staleAfterMinutes * 60 * 1000;
  const status = summarizeSessionStatus(input.turn.runtime, {
    agentId: input.agentId,
    staleAfterMs,
  });
  if (status.counts.active === 0) return [];

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
  }];
}

function formatChannels(channels: string[]): string {
  const unique = [...new Set(channels)].slice(0, 5);
  const suffix = channels.length > unique.length
    ? `,+${channels.length - unique.length} more`
    : "";
  return unique.map((channel) => `#${channel}`).join(",") + suffix;
}
