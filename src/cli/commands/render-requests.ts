import {
  endingWords,
  modelWords,
  type RequestMessage,
  type RequestOmission,
  type RequestPage,
  type RequestSummary,
  type SessionRequest,
} from "../../contracts/agent/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { indent } from "./render.ts";
import { renderTable } from "./table.ts";

/** Table of model requests for a session, newest first. */
export function renderRequestList(page: RequestPage): string[] {
  const rows = page.items.map((item) => [
    item.id,
    item.captured ? "captured" : "unrecorded",
    localTime(item.at),
    modelWords(item.model),
    outcomeCell(item),
    item.estimatedTokens === null ? "-" : String(item.estimatedTokens),
    tokensCell(item),
    String(item.omissionsCount),
  ]);
  const lines = renderTable(["request", "source", "at", "model", "outcome", "est", "tokens", "omissions"], rows);
  if (page.before !== null) lines.push("", `More requests before ${page.before}: pass --before ${page.before}`);
  return lines;
}

/** Full human-readable view of one reconstructed model request. */
export function renderRequestDetail(req: SessionRequest): string {
  const { summary, settings, budget, sections, tools, deferredTools, omissions, rawEntries, effectiveMessages } = req;
  const lines: string[] = [];

  lines.push(
    `Request ${summary.id} (${summary.captured ? "captured" : "unrecorded fallback from Pi log"})`,
    `  at: ${localTime(summary.at)} · attempt: ${String(summary.attempt)} · cutoff: #${String(summary.cutoff)} · assistant: ${summary.assistantEntry === null ? "none" : `#${String(summary.assistantEntry)}`}`,
    `  outcome: ${outcomeLine(summary)}`,
    "",
  );

  lines.push("Model & settings");
  lines.push(
    `  model: ${modelWords({ provider: settings.provider, id: settings.id })}${settings.api === null ? "" : ` (${settings.api})`} · source: ${settings.modelSource}`,
    `  thinking: ${settings.thinkingLevel} · tools: ${settings.toolExecution ?? "unknown"} · maxTurns: ${settings.maxTurns === null ? "unlimited" : String(settings.maxTurns)}`,
    `  queues: steer=${settings.steeringMode ?? "unknown"} followUp=${settings.followUpMode ?? "unknown"}`,
  );
  if (settings.streamOptions !== null) {
    const s = settings.streamOptions;
    const parts = [
      ...(s.transport === null ? [] : [`transport=${s.transport}`]),
      ...(s.cacheRetention === null ? [] : [`cache=${s.cacheRetention}`]),
      ...(s.timeoutMs === null ? [] : [`timeout=${String(s.timeoutMs)}ms`]),
      ...(s.maxRetries === null ? [] : [`maxRetries=${String(s.maxRetries)}`]),
      ...(s.deferred ? ["deferred=true"] : []),
    ];
    if (parts.length > 0) lines.push(`  stream: ${parts.join(" · ")}`);
  }
  lines.push("");

  lines.push("Budgets");
  lines.push(
    `  tokens: estimated=${budget.estimatedTokens === null ? "unknown" : String(budget.estimatedTokens)} · actual_in=${budget.actualInputTokens === null ? "-" : String(budget.actualInputTokens)} · window=${budget.contextWindow === null ? "unknown" : String(budget.contextWindow)} · max_out=${budget.maxTokens === null ? "unknown" : String(budget.maxTokens)}`,
  );
  if (budget.compaction !== null) {
    const c = budget.compaction;
    lines.push(
      `  compaction: ${c.enabled ? "enabled" : "disabled"} · reserve=${String(c.reserveTokens)} · keepRecent=${String(c.keepRecentTokens)} · background=${String(c.backgroundTokens)} · blockingAt=${c.blockingAt === null ? "-" : String(c.blockingAt)} · backgroundAt=${c.backgroundAt === null ? "-" : String(c.backgroundAt)}`,
    );
  }
  for (const input of budget.inputs) {
    const backlog =
      input.backlogBudgetChars === null
        ? ""
        : ` · backlog ${String(input.backlogUsedChars ?? 0)}/${String(input.backlogBudgetChars)} chars`;
    const crumbs =
      input.breadcrumbsLimit === null
        ? ""
        : ` · breadcrumbs ${String(input.breadcrumbsShown)}/${String(input.breadcrumbsLimit)}`;
    lines.push(`  input #${String(input.entry)}: source=${input.source}${backlog}${crumbs}`);
  }
  lines.push("");

  lines.push(`Sections (${String(sections.length)})`);
  for (const section of sections) {
    lines.push(`  ${section.key} (${section.sha256}${section.revisionRecorded ? "" : ", revision unrecorded"})`);
    for (const src of section.sources) {
      const carried = src.carriedOver ? ", carried over" : "";
      lines.push(`    - ${src.path} [${src.origin}, ${src.sha256}, ${String(src.bytes)}B${carried}]`);
    }
  }
  lines.push("");

  lines.push(`Offered tools (${String(tools.length)})`);
  if (tools.length === 0) {
    lines.push("  (none)");
  } else {
    lines.push(`  ${tools.map((tool) => (tool.extension === null ? tool.name : `${tool.name} [${tool.extension}]`)).join(", ")}`);
  }
  if (deferredTools.length > 0) lines.push(`  deferred: ${deferredTools.join(", ")}`);
  lines.push("");

  lines.push(`Omissions (${String(omissions.length)})`);
  if (omissions.length === 0) {
    lines.push("  (none)");
  } else {
    for (const omission of omissions) lines.push(`  - ${omissionLine(omission)}`);
  }
  lines.push("");

  lines.push(`Raw entries (${String(rawEntries.length)})`);
  if (rawEntries.length > 0) {
    const rows = rawEntries.map((entry) => [
      `#${String(entry.id)}`,
      entry.kind,
      entry.status,
      String(entry.contributedCount),
      entry.statusDetail ?? "",
    ]);
    for (const row of renderTable(["entry", "kind", "status", "msgs", "detail"], rows)) lines.push(`  ${row}`);
  }
  lines.push("");

  lines.push(`Effective messages (${String(effectiveMessages.length)})`);
  for (const [index, message] of effectiveMessages.entries()) {
    lines.push(...renderMessage(index, message), "");
  }

  return lines.join("\n").trimEnd();
}

function outcomeCell(item: RequestSummary): string {
  if (item.outcome.kind === "in_flight") return "in flight";
  return endingWords(item.outcome.how) ?? item.outcome.how;
}

function tokensCell(item: RequestSummary): string {
  if (item.outcome.kind !== "ended" || item.outcome.usage === null) return "-";
  return `${String(item.outcome.usage.input)}/${String(item.outcome.usage.output)}`;
}

function outcomeLine(item: RequestSummary): string {
  if (item.outcome.kind === "in_flight") return "in flight";
  const how = endingWords(item.outcome.how) ?? item.outcome.how;
  const detail = item.outcome.detail === null ? "" : ` (${item.outcome.detail})`;
  const usage =
    item.outcome.usage === null
      ? ""
      : ` · in=${String(item.outcome.usage.input)} out=${String(item.outcome.usage.output)} cacheRead=${String(item.outcome.usage.cacheRead)} cost=$${item.outcome.usage.cost.toFixed(4)}`;
  return `${how}${detail}${usage}`;
}

function omissionLine(omission: RequestOmission): string {
  switch (omission.kind) {
    case "home_file":
      return `home_file: ${omission.file} (${omission.reason})`;
    case "backlog_cut":
      return `backlog_cut (#${String(omission.entry)}): ${omission.atLeast ? "at least " : ""}${String(omission.cut)} earlier messages omitted (${String(omission.usedChars)}/${String(omission.budgetChars)} chars${omission.clipped ? ", oldest shown message clipped" : ""})`;
    case "breadcrumb_deferred":
      return `breadcrumb_deferred (#${String(omission.entry)}): ${String(omission.deferred)} changed breadcrumbs deferred (limit ${String(omission.limit)})`;
    case "breadcrumb_truncated":
      return `breadcrumb_truncated (#${String(omission.entry)}): ${omission.file} cut from ${String(omission.originalChars)} to ${String(omission.limitChars)} chars`;
    case "output_truncated":
      return `output_truncated (#${String(omission.entry)}, ${omission.source}): ${omission.label} (${omission.reason})`;
    case "before_head":
      return `before_head (#${String(omission.headEntry)}, ${omission.headKind}${omission.reason === null ? "" : `/${omission.reason}`}): ${String(omission.omittedEntries)} earlier entries excluded`;
    case "entry_edited":
      return `entry_edited (#${String(omission.entry)} ${omission.entryKind}): ${omission.action} by #${String(omission.byEntry)}`;
    case "entry_excluded":
      return `entry_excluded (#${String(omission.entry)} ${omission.entryKind}): stopReason=${omission.stopReason}`;
    case "missing_tool_result":
      return `missing_tool_result: ${omission.toolName} (${omission.toolCallId}) synthesized`;
  }
}

function renderMessage(index: number, message: RequestMessage): string[] {
  const hookTag = message.modifiedByHook ? " [hook-modified]" : "";
  switch (message.role) {
    case "system": {
      const header = `[${String(index)}] system${hookTag}`;
      const body: string[] = [];
      if (message.content !== "") body.push(...indent(message.content));
      for (const patch of message.sections) {
        if (patch.value === null) body.push(`  section -${patch.key}`);
        else body.push(`  section ${patch.key} (${String(patch.value.length)} chars)`);
      }
      if (message.toolsAdded.length > 0) body.push(`  tools +${message.toolsAdded.join(", ")}`);
      if (message.toolsRemoved.length > 0) body.push(`  tools -${message.toolsRemoved.join(", ")}`);
      return [header, ...body];
    }
    case "user":
      return [`[${String(index)}] user${hookTag}`, ...renderBlocks(message.blocks)];
    case "assistant":
      return [
        `[${String(index)}] assistant (${message.stopReason}${message.model === null ? "" : `, ${message.model}`})${hookTag}`,
        ...renderBlocks(message.blocks),
      ];
    case "toolResult": {
      const synth = message.synthesized ? " [synthesized]" : "";
      const err = message.isError ? " [error]" : "";
      return [
        `[${String(index)}] toolResult ${message.toolName} (${message.toolCallId})${err}${synth}${hookTag}`,
        ...renderBlocks(message.blocks),
      ];
    }
  }
}

function renderBlocks(blocks: readonly Extract<RequestMessage, { role: "user" }>["blocks"][number][]): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "text":
        out.push(...indent(block.text));
        break;
      case "thinking":
        out.push("  [thinking]", ...indent(block.thinking));
        break;
      case "image":
        out.push(`  [image: ${block.mimeType}]`);
        break;
      case "toolCall":
        out.push(`  [toolCall ${block.name} (${block.id})] ${block.args}`);
        break;
    }
  }
  return out;
}
