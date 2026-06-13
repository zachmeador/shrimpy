import type {
  executeSessionLifecycleAction,
  executeSessionStopAction,
  executeSessionThinkingAction,
  SessionCompactionPolicySummary,
  SessionListingSummary,
  SessionPathSummary,
  SessionReadResult,
  SessionSearchResult,
  SessionStatusSummary,
  SingleSessionListingSummary,
} from "../sessions/index.js";
import { formatSessionAge } from "../sessions/index.js";
import { accent, dim, label } from "../util/style.js";
import type { GatewayLaneState } from "../gateway/runtime-state.js";

export function printSessionListing(
  summary: SessionListingSummary | SingleSessionListingSummary,
  status?: SessionStatusSummary,
): void {
  if ("channel" in summary) {
    printSingleSessionListing(summary);
    return;
  }

  if (summary.active.length === 0 && summary.recentArchives.length === 0) {
    console.log(dim("(no sessions)"));
    return;
  }

  if (summary.active.length === 0) {
    console.log(dim("(no active sessions)"));
  } else {
    console.log(label("active sessions:"));
    for (const session of summary.active) {
      const statusEntry = status?.active.find((entry) =>
        entry.channel === session.channel && entry.path === session.path
      );
      const recency = statusEntry
        ? `  ${statusEntry.status} ${formatSessionAge(statusEntry.ageMs)} ago`
        : "";
      console.log(
        `  ${accent(session.channel)}  ${session.path}  ${dim(session.updatedAt ?? "(unknown)")}${recency}`,
      );
    }
    if (status) {
      console.log(
        dim(
          `  ${status.counts.recent} recent, ${status.counts.stale} stale (>${formatSessionAge(status.staleAfterMs)})`,
        ),
      );
    }
  }

  if (summary.recentArchives.length > 0) {
    console.log(label("recent archives:"));
    for (const archived of summary.recentArchives) {
      console.log(`  ${archived.name}  ${dim(archived.path)}`);
    }
  }

  printGatewayLanes(summary.gatewayLanes);
}

export function printSessionLifecycleResult(
  result: ReturnType<typeof executeSessionLifecycleAction>,
): void {
  switch (result.kind) {
    case "local_restore":
      console.log(`restored ${result.agentId} session for ${result.channel}`);
      console.log(`restored_from: ${result.restoredFrom}`);
      if (result.archivedPreviousTo) {
        console.log(`archived_previous: ${result.archivedPreviousTo}`);
      }
      return;
    case "local_reset":
      if (result.archivedTo) {
        console.log(`reset ${result.agentId} session for ${result.channel}`);
        console.log(`archived: ${result.archivedTo}`);
      } else {
        console.log(`no existing ${result.agentId} session for ${result.channel}`);
      }
      return;
    case "requested_restore":
      console.log(
        `requested restore session for ${result.agentId} on ${result.channel}${result.requestedArchive ? ` (${result.requestedArchive})` : ""}`,
      );
      return;
    case "requested_reset":
      console.log(`requested ${result.action} session for ${result.agentId} on ${result.channel}`);
      return;
  }
}

export function printSessionThinkingResult(
  result: Awaited<ReturnType<typeof executeSessionThinkingAction>>,
): void {
  switch (result.kind) {
    case "local_thinking":
      console.log(
        `set thinking for ${result.agentId} session on ${result.channel} to ${result.effectiveLevel}`,
      );
      if (result.effectiveLevel !== result.requestedLevel) {
        console.log(`requested: ${result.requestedLevel}`);
      }
      return;
    case "requested_thinking":
      console.log(
        `requested thinking ${result.level} for ${result.agentId} on ${result.channel}`,
      );
      return;
  }
}

export function printSessionStopResult(
  result: ReturnType<typeof executeSessionStopAction>,
): void {
  switch (result.kind) {
    case "local_stop_unavailable":
      console.log(`no gateway turn to stop for ${result.agentId} on ${result.channel}`);
      return;
    case "requested_stop":
      console.log(`requested stop for ${result.agentId} on ${result.channel}`);
      return;
  }
}

export function printSessionCompactionPolicy(
  summary: SessionCompactionPolicySummary,
): void {
  console.log(`${label("agent:")} ${accent(summary.agentId)}`);
  console.log(`${label("channel:")} ${accent(summary.channel)}`);
  console.log(`${label("session_type:")} ${summary.sessionType}`);
  console.log(`${label("session_dir:")} ${summary.sessionDir}`);
  console.log(`${label("active:")} ${formatSessionPath(summary.activeSession)}`);
  if (summary.model) {
    console.log(
      `${label("model:")} ${summary.model.provider}/${summary.model.id}`
      + (summary.model.contextWindow ? ` (${summary.model.contextWindow} tokens)` : ""),
    );
    if (summary.model.inference) {
      console.log(`  inference: ${formatInference(summary.model.inference)}`);
    }
  }
  console.log(label("effective compaction:"));
  console.log(`  enabled: ${summary.effective.enabled}`);
  console.log(`  thresholdTokens: ${summary.effective.thresholdTokens ?? "(derived from reserveTokens)"}`);
  console.log(`  reserveTokens: ${summary.effective.reserveTokens}`);
  console.log(`  keepRecentTokens: ${summary.effective.keepRecentTokens}`);
  console.log(`  matched: ${summary.effective.matched.join(" -> ")}`);
  if (summary.effective.instructions) {
    console.log(`  instructions: ${summary.effective.instructions}`);
  }
  if (summary.recorded) {
    console.log(label("recorded active policy:"));
    console.log(`  enabled: ${summary.recorded.enabled}`);
    console.log(`  thresholdTokens: ${summary.recorded.thresholdTokens ?? "(derived from reserveTokens)"}`);
    console.log(`  reserveTokens: ${summary.recorded.reserveTokens}`);
    console.log(`  keepRecentTokens: ${summary.recorded.keepRecentTokens}`);
  }
  if (summary.recordedSession) {
    console.log(label("recorded session runtime:"));
    if (summary.recordedSession.provider || summary.recordedSession.id) {
      console.log(
        `  model: ${summary.recordedSession.provider ?? "(unknown)"}/${summary.recordedSession.id ?? "(unknown)"}`,
      );
    }
    if (summary.recordedSession.bootedAt) {
      console.log(`  booted_at: ${summary.recordedSession.bootedAt}`);
    }
    if (summary.recordedSession.inference) {
      console.log(`  inference: ${formatInference(summary.recordedSession.inference)}`);
    }
  }
  console.log(`${label("restart_required:")} ${summary.restartRequired}`);
  console.log(`${label("note:")} ${summary.note}`);
}

export function printSessionSearchResult(result: SessionSearchResult): void {
  console.log(
    `${label("sessions:")} ${result.matchedCount}/${result.totalEntries} matches  ${dim(`sessions=${result.totalSessions} showing=${result.returnedCount}`)}`,
  );
  if (result.matches.length === 0) {
    console.log(dim("(no matches)"));
    for (const hint of result.hints) {
      console.log(`  ${dim(hint)}`);
    }
    return;
  }

  for (const match of result.matches) {
    const timestamp = match.entryTimestamp ?? "(unknown)";
    const tool = match.toolName ? ` tool=${match.toolName}` : "";
    console.log(
      `${dim(timestamp)}  ${accent(match.agentId)}:${match.sessionLabel}  ${match.lifecycleState}  ${match.role}/${match.matchKind}${tool}`,
    );
    console.log(`  ${match.snippet}`);
    console.log(
      `  ${label("read:")} shrimpy sessions read ${match.relativePath} --around ${match.entryId}`,
    );
  }
}

export function printSessionReadResult(result: SessionReadResult): void {
  console.log(
    `${label("session:")} ${accent(result.agentId)}:${result.sessionLabel}  ${result.lifecycleState}  ${dim(result.relativePath)}`,
  );
  console.log(`${label("around:")} ${result.aroundEntryId}  ${dim(`window=${result.window}`)}`);
  for (const entry of result.entries) {
    const timestamp = entry.timestamp ?? "(unknown)";
    const tool = entry.toolName ? ` tool=${entry.toolName}` : "";
    console.log(`${dim(timestamp)}  ${entry.id}  ${entry.role}${tool}`);
    console.log(`  ${entry.snippet}`);
  }
}

function printSingleSessionListing(summary: SingleSessionListingSummary): void {
  console.log(`${label("channel:")} ${accent(summary.channel)}`);
  console.log(`${label("active:")} ${formatSessionPath(summary.active)}`);
  printGatewayLanes(summary.gatewayLanes);

  if (summary.archives.length === 0) {
    console.log(`${label("archives:")} ${dim("(none)")}`);
    return;
  }

  console.log(label("archives:"));
  for (const archived of summary.archives) {
    console.log(`  ${archived.name}  ${dim(archived.path)}`);
  }
}

function printGatewayLanes(lanes: GatewayLaneState[]): void {
  if (lanes.length === 0) return;

  console.log(label("gateway lanes:"));
  for (const lane of lanes) {
    const running = lane.currentTurn
      ? `running ${formatSessionAge(Date.now() - lane.currentTurn.startedAt)}`
      : "idle";
    const last = lane.lastOutcome
      ? ` last=${lane.lastOutcome.outcome} ${formatSessionAge(Date.now() - lane.lastOutcome.at)} ago`
      : "";
    console.log(
      `  ${accent(lane.agentId)} ${lane.channel}  ${running} queued=${lane.queueDepth}${dim(last)}`,
    );
  }
}

function formatSessionPath(summary: SessionPathSummary): string {
  return `${summary.path}${summary.exists ? "" : ` ${dim("(missing)")}`}`;
}

function formatInference(inference: NonNullable<SessionCompactionPolicySummary["model"]>["inference"]): string {
  if (!inference) return "none";
  const params = Object.entries(inference.params)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  return [
    inference.baseModel ? `baseModel=${inference.baseModel}` : undefined,
    inference.enableThinking !== undefined ? `enableThinking=${inference.enableThinking}` : undefined,
    `params=${params || "none"}`,
  ].filter(Boolean).join(" ");
}
