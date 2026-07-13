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
  SessionSummary,
} from "../sessions/index.js";
import { formatSessionAge } from "../sessions/index.js";
import { accent, dim, label } from "../util/style.js";
import type { GatewayLaneState } from "../gateway/runtime-state.js";

export function printSessionListing(
  summary: SessionListingSummary | SessionSummary,
  status?: SessionStatusSummary,
): void {
  if ("sessionId" in summary) {
    printSingleSessionListing(summary);
    return;
  }

  if (summary.sessions.length === 0) {
    console.log(dim("(no sessions)"));
    return;
  }

  console.log(label("sessions:"));
  for (const session of summary.sessions) {
    const statusEntry = status?.active.find((entry) =>
      entry.sessionId === session.sessionId && entry.path === session.active.path
    );
      const recency = statusEntry
        ? `  ${statusEntry.status} ${formatSessionAge(statusEntry.ageMs)} ago`
        : "";
    const owner = session.owner ? ` owner=${session.owner.kind}:${session.owner.pid}` : "";
    console.log(
      `  ${accent(session.sessionId)}  ${session.purpose}  ${formatSessionPath(session.active)}${owner}${recency}`,
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

export function printSessionLifecycleResult(
  result: Awaited<ReturnType<typeof executeSessionLifecycleAction>>,
): void {
  printSessionActionResult(result);
}

export function printSessionThinkingResult(
  result: Awaited<ReturnType<typeof executeSessionThinkingAction>>,
): void {
  printSessionActionResult(result);
}

export function printSessionStopResult(
  result: Awaited<ReturnType<typeof executeSessionStopAction>>,
): void {
  printSessionActionResult(result);
}

function printSessionActionResult(
  result: Awaited<ReturnType<typeof executeSessionLifecycleAction>>,
): void {
  if (result.outcome === "failed" || result.outcome === "unconfirmed") {
    console.error(result.message ?? `${result.operation} ${result.outcome}`);
    return;
  }
  if (result.outcome === "queued") {
    console.log(`queued ${result.operation} for ${result.sessionId}`);
    return;
  }
  const archive = result.archiveName ? ` archive=${result.archiveName}` : "";
  console.log(`${result.operation} ${result.sessionId} ${result.outcome}${archive}`);
}

export function printSessionCompactionPolicy(
  summary: SessionCompactionPolicySummary,
): void {
  console.log(`${label("agent:")} ${accent(summary.agentId)}`);
  console.log(`${label("session:")} ${accent(summary.sessionId)}`);
  console.log(`${label("purpose:")} ${summary.purpose}`);
  console.log(`${label("session_dir:")} ${summary.sessionDir}`);
  console.log(`${label("active:")} ${formatSessionPath(summary.activeSession)}`);
  if (summary.model) {
    console.log(
      `${label("model:")} ${summary.model.provider}/${summary.model.id}`
      + (summary.model.contextWindow ? ` (${summary.model.contextWindow} tokens)` : ""),
    );
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

function printSingleSessionListing(summary: SessionSummary): void {
  console.log(`${label("session:")} ${accent(summary.sessionId)}`);
  console.log(`${label("purpose:")} ${summary.purpose}`);
  console.log(`${label("delivery:")} ${summary.delivery.kind}`);
  console.log(`${label("active:")} ${formatSessionPath(summary.active)}`);
  if (summary.owner) {
    console.log(`${label("owner:")} ${summary.owner.kind} pid=${summary.owner.pid}`);
  }
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
