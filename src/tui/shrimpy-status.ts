import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { formatVersionLabel } from "../app/metadata.js";
import type { AppRuntime } from "../app/runtime.js";
import {
  collectChannelActivity,
  loadChannelWatchClockSummary,
  type ChannelMessageSnapshot,
} from "../channels/activity.js";
import { timeSince } from "../channels/format.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import { formatGatewayServiceSummary, readGatewayServiceStatus } from "../gateway/service-ctl.js";
import { inspectSkills } from "../skills/index.js";
import { formatFutureOrPast } from "../util/time-format.js";
import {
  inspectWatches,
  loadRuntimeWatchIds,
  type WatchInspection,
} from "../watches/index.js";

export interface ShrimpyTuiCommandOptions {
  runtime: AppRuntime;
  agentId: string;
  sessionId: string;
  purpose: string;
  cwd: string;
}

export interface ShrimpyTuiStatusContext {
  cwd: string;
  model: unknown;
}

const STATUS_SECTIONS = [
  "overview",
  "workspace",
  "gateway",
  "watches",
  "agents",
  "channels",
  "context",
  "skills",
  "model",
  "doctor",
] as const;

type StatusSection = (typeof STATUS_SECTIONS)[number];

const STATUS_SECTION_DESCRIPTIONS: Record<StatusSection, string> = {
  overview: "Workspace, active agent, model, and available status sections",
  workspace: "Workspace paths and config",
  gateway: "Gateway service, watch runs, watch clock, and interaction status",
  watches: "Watch inventory, next runs, recent runs, and wake opportunities",
  agents: "Active agent and configured agents",
  channels: "Channel log overview",
  context: "Context files and source inspection",
  skills: "Source, workspace, agent, and package skills",
  model: "Active model and model state paths",
  doctor: "Diagnostic command pointers",
};

export function completeStatusSection(prefix: string) {
  const normalized = prefix.trim().toLowerCase();
  return STATUS_SECTIONS
    .filter((section) => !normalized || section.startsWith(normalized))
    .map((section) => ({
      value: section,
      label: section,
      description: STATUS_SECTION_DESCRIPTIONS[section],
    }));
}

export function buildStatusText(
  ctx: ShrimpyTuiStatusContext,
  options: ShrimpyTuiCommandOptions,
  args: string,
): string {
  const section = parseStatusSection(args);
  if (!section) return unknownStatusText(args);

  switch (section) {
    case "overview": return overviewStatusText(ctx, options);
    case "workspace": return workspaceStatusText(options);
    case "gateway": return gatewayStatusText(options);
    case "watches": return watchesStatusText(options);
    case "agents": return agentsStatusText(options);
    case "channels": return channelsStatusText(options);
    case "context": return contextStatusText(options);
    case "skills": return skillsStatusText(options);
    case "model": return modelStatusText(ctx, options);
    case "doctor": return doctorStatusText(options);
  }
}

function overviewStatusText(
  ctx: ShrimpyTuiStatusContext,
  options: ShrimpyTuiCommandOptions,
): string {
  return [
    label("Version", formatVersionLabel()),
    label("Agent", options.agentId),
    label("Session", `${options.sessionId} / ${options.purpose}`),
    label("Gateway", formatGatewayServiceSummary(readGatewayServiceStatus())),
    label("Workspace", options.runtime.paths.workspace),
    label("CWD", ctx.cwd),
    label("Model", formatSessionModel(ctx.model)),
    "",
    "Sections",
    ...STATUS_SECTIONS
      .filter((section) => section !== "overview")
      .map((section) => `/status ${section}  ${STATUS_SECTION_DESCRIPTIONS[section]}`),
  ].join("\n");
}

function workspaceStatusText(options: ShrimpyTuiCommandOptions): string {
  const runtime = options.runtime;
  const agentPaths = runtime.getAgentPaths(options.agentId);
  return [
    label("Workspace", runtime.paths.workspace),
    label("Config", runtime.paths.primaryConfigPath),
    label("CWD", options.cwd),
    label("Agent", options.agentId),
    label("Agent root", agentPaths.root),
    "",
    "Inspect",
    "shrimpy status",
    "shrimpy context --sections",
  ].join("\n");
}

function gatewayStatusText(options: ShrimpyTuiCommandOptions): string {
  const runtime = options.runtime;
  const service = readGatewayServiceStatus();
  const watchIds = loadRuntimeWatchIds(runtime);
  const activity = collectChannelActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
    watchIds,
  );
  const watchClock = loadChannelWatchClockSummary(
    runtime.paths.watchClockStatePath,
    runtime.resolved.status,
    watchIds,
  );
  const lines = [
    label("Gateway manager", service.manager),
    label("Gateway service", service.active),
    label("Gateway enabled", service.enabled),
    ...(service.definitionPath ? [label("Gateway service file", service.definitionPath)] : []),
    label("Gateway log", runtime.paths.gatewayLogPath),
    ...(service.serviceLogPath ? [label("Gateway service log", service.serviceLogPath)] : []),
    label("Tracked channels", String(activity.channelCount)),
    label("Last watch run", activity.lastWatchRun
      ? when(activity.lastWatchRun.message.timestamp)
      : "(none)"),
    label("Last user interaction", activity.lastUserInteraction
      ? when(activity.lastUserInteraction.message.timestamp)
      : "(none)"),
    label("Next watch run due", watchClock.nextWatchRun === undefined
      ? "(unknown)"
      : `${formatFutureOrPast(watchClock.nextWatchRun.nextRunAtMs)} (${new Date(watchClock.nextWatchRun.nextRunAtMs).toLocaleString()})`),
  ];
  if (activity.lastUserInteraction) {
    lines.push(label("Last interaction source", formatInteractionSource(activity.lastUserInteraction)));
  }
  lines.push("", "Inspect", "shrimpy gateway status", "shrimpy gateway logs");
  return lines.join("\n");
}

function watchesStatusText(options: ShrimpyTuiCommandOptions): string {
  const watches = inspectWatches(options.runtime);
  const active = watches.filter((watch) => watch.ownerAgentId === options.agentId);
  const next = watches
    .filter((watch) => watch.nextRunAtMs !== undefined)
    .sort((a, b) => (a.nextRunAtMs ?? 0) - (b.nextRunAtMs ?? 0))[0];
  const recent = watches
    .filter((watch) => watch.lastRun)
    .sort((a, b) => (b.lastRun?.finishedAtMs ?? 0) - (a.lastRun?.finishedAtMs ?? 0))[0];
  const ordered = [
    ...active,
    ...watches.filter((watch) => watch.ownerAgentId !== options.agentId),
  ];
  const inventory = ordered.length > 0
    ? ordered.slice(0, 10).map((watch) => formatWatchSummaryLine(watch, options.agentId))
    : ["(none)"];
  if (ordered.length > 10) inventory.push(`... ${ordered.length - 10} more`);
  return [
    label("Configured", String(watches.length)),
    label(`Agent ${options.agentId}`, String(active.length)),
    label("Next due", next?.nextRunAtMs === undefined
      ? "(unknown)"
      : `${next.id} ${formatFutureOrPast(next.nextRunAtMs)}`),
    label("Last run", recent?.lastRun
      ? `${recent.id} ${recent.lastRun.status} ${when(recent.lastRun.finishedAtMs)}`
      : "(none)"),
    "",
    "Inventory",
    ...inventory,
    "",
    "Inspect",
    "shrimpy watches",
    `shrimpy watches --agent ${options.agentId}`,
    "shrimpy watches show <agent-id>/<watch-id>",
    "shrimpy watches history <agent-id>/<watch-id>",
    "shrimpy watches run <agent-id>/<watch-id>",
  ].join("\n");
}

function agentsStatusText(options: ShrimpyTuiCommandOptions): string {
  const lines = [label("Active", options.agentId)];
  for (const agent of options.runtime.resolved.agents) {
    const marker = agent.id === options.agentId ? "*" : "-";
    lines.push(`${marker} ${agent.id} root=${agent.root} cwd=${agent.cwd} tools=${agent.tools?.join(",") ?? "default"} thinking=${agent.thinking ?? "inherit"} model_policy=${agent.modelPolicy ?? DEFAULT_MODEL_POLICY}`);
  }
  lines.push("", "Inspect", "shrimpy agent list", `shrimpy agent show ${options.agentId}`);
  return lines.join("\n");
}

function channelsStatusText(options: ShrimpyTuiCommandOptions): string {
  const dir = options.runtime.paths.channelsDir;
  const files = existsSync(dir)
    ? readdirSync(dir).filter((file) => file.endsWith(".jsonl")).sort()
    : [];
  const lines = files.slice(0, 12).map((file) => {
    const path = join(dir, file);
    return `${basename(file, ".jsonl")} ${countLines(path)} msgs`;
  });
  if (lines.length === 0) lines.push("(none)");
  if (files.length > 12) lines.push(`... ${files.length - 12} more`);
  lines.push("", "Inspect", "shrimpy channels", "shrimpy channels read <name> --limit 20");
  return lines.join("\n");
}

function contextStatusText(options: ShrimpyTuiCommandOptions): string {
  const paths = options.runtime.getAgentPaths(options.agentId);
  return [
    label("Agent context", paths.contextDir),
    label("Agent soul", paths.soulPath),
    "",
    "Inspect",
    `shrimpy context files list --agent ${options.agentId}`,
    `shrimpy context sources list --agent ${options.agentId}`,
    `shrimpy context turn --agent ${options.agentId}`,
  ].join("\n");
}

function skillsStatusText(options: ShrimpyTuiCommandOptions): string {
  const inventory = inspectSkills(options.runtime, options.agentId);
  const lines = inventory.skills.slice(0, 16).map((skill) => {
    const name = skill.name !== skill.id ? ` name=${skill.name}` : "";
    return `${skill.id} [${skill.scope}]${name}${skill.loaded ? "" : " (not loaded by Pi)"}`;
  });
  if (lines.length === 0) lines.push("(none)");
  if (inventory.skills.length > 16) lines.push(`... ${inventory.skills.length - 16} more`);
  lines.push(...inventory.warnings.map((warning) => `warning: ${warning}`));
  lines.push("", "Inspect", `shrimpy skills list --agent ${options.agentId}`);
  return lines.join("\n");
}

function modelStatusText(
  ctx: ShrimpyTuiStatusContext,
  options: ShrimpyTuiCommandOptions,
): string {
  return [
    label("Active", formatSessionModel(ctx.model)),
    label("Agent policy", options.runtime.getAgent(options.agentId).modelPolicy ?? DEFAULT_MODEL_POLICY),
    label("Auth state", options.runtime.paths.authPath),
    label("Model state", options.runtime.paths.modelsPath),
    "",
    "Inspect",
    "Use Pi /model for live selection",
    "Use Pi /login for provider auth",
    `shrimpy models resolve --session ${options.sessionId}`,
  ].join("\n");
}

function doctorStatusText(options: ShrimpyTuiCommandOptions): string {
  return [
    "Diagnostics remain CLI-first.",
    "",
    "Run",
    "shrimpy status",
    "shrimpy context --sections",
    `shrimpy agent show ${options.agentId}`,
    "shrimpy channels",
  ].join("\n");
}

function parseStatusSection(args: string): StatusSection | undefined {
  const normalized = args.trim().toLowerCase() || "overview";
  return STATUS_SECTIONS.includes(normalized as StatusSection)
    ? normalized as StatusSection
    : undefined;
}

function unknownStatusText(args: string): string {
  return [
    `Unknown section: ${args.trim() || "(empty)"}`,
    "",
    "Sections",
    ...STATUS_SECTIONS.map((section) => `${section} - ${STATUS_SECTION_DESCRIPTIONS[section]}`),
  ].join("\n");
}

function formatWatchSummaryLine(watch: WatchInspection, activeAgentId: string): string {
  const marker = watch.ownerAgentId === activeAgentId ? "*" : "-";
  const next = watch.nextRunAtMs === undefined
    ? "next=unknown"
    : `next=${formatFutureOrPast(watch.nextRunAtMs)}`;
  return `${marker} ${watch.id} ${watch.enabled ? "enabled" : "disabled"} ${watch.triggerText} action=${watch.actionKind} -> ${watch.targetChannels.join(",") || "(none)"} turns=${watch.expectedTurnAgentIds.join(",") || "(none)"} ${next}${watch.diagnostics.length > 0 ? ` warnings=${watch.diagnostics.length}` : ""}`;
}

function formatSessionModel(model: unknown): string {
  const value = model as { provider?: string; id?: string; modelId?: string; name?: string } | undefined;
  if (!value) return "(none selected)";
  return `${value.provider ?? "provider?"}/${value.id ?? value.modelId ?? value.name ?? "model?"}`;
}

function formatInteractionSource(snapshot: ChannelMessageSnapshot): string {
  const sender = snapshot.message.sender.displayName
    ? `${snapshot.message.sender.kind}:${snapshot.message.sender.displayName}`
    : `${snapshot.message.sender.kind}:${snapshot.message.sender.actorId}`;
  return `${snapshot.channel} (${sender})`;
}

function when(ms: number): string {
  return `${timeSince(ms)} (${new Date(ms).toLocaleString()})`;
}

function label(name: string, value: string): string {
  return `${name}: ${value}`;
}

function countLines(path: string): number {
  const text = existsSync(path) ? readFileSync(path, "utf-8") : "";
  if (!text) return 0;
  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
}
