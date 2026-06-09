import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  DynamicBorder,
  type AgentSession,
  type InteractiveMode,
} from "@earendil-works/pi-coding-agent";
import {
  Markdown,
  Spacer,
  Text,
  type Component,
  type MarkdownTheme,
} from "@earendil-works/pi-tui";
import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { ThinkingSelectorComponent } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/components/thinking-selector.js";
import { theme } from "../../node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/theme/theme.js";
import { formatVersionLabel } from "../app/metadata.js";
import type { AppRuntime } from "../app/runtime.js";
import { projectRoot } from "../app/project-root.js";
import { timeSince } from "../channels/format.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import {
  collectGatewayActivity,
  loadGatewayWatchClockSummary,
  type ChannelMessageSnapshot,
} from "../gateway/status.js";
import { loadGatewayWatchIds } from "../gateway/watch-service.js";
import { formatGatewayServiceSummary, readGatewayServiceStatus } from "../gateway-ctl.js";
import {
  inspectWatches,
  type WatchInspection,
} from "../watches/index.js";
import { inspectSkills } from "../skills/index.js";
import { archiveSessionFile } from "../sessions/storage.js";
import { formatFutureOrPast } from "../util/time-format.js";

type SubmitHandler = (text: string) => void | Promise<void>;
type ShowSelectorFactory = (done: () => void) => {
  component: Component;
  focus: Component;
};

interface InteractiveModeCommandSurfaceInternals {
  showSelector(create: ShowSelectorFactory): void;
  setupEditorSubmitHandler(): void;
  handleChangelogCommand(): void;
  defaultEditor: {
    onSubmit?: SubmitHandler;
  };
  editor: {
    setText(text: string): void;
  };
  chatContainer: {
    addChild(component: Component): void;
  };
  ui: {
    requestRender(): void;
  };
  session: AgentSession;
  handleClearCommand(): Promise<void>;
  footer: {
    invalidate(): void;
  };
  showStatus(message: string): void;
  getMarkdownThemeWithSettings(): MarkdownTheme;
  updateEditorBorderColor(): void;
}

interface ShrimpyCommandSurfaceOptions {
  runtime: AppRuntime;
  agentId: string;
  channel: string;
  sessionType: string;
  cwd: string;
}

const HELP_LINES = [
  "Shrimpy commands",
  "",
  "/status [section]  Show Shrimpy workspace, gateway, watch, agent, channel, context, skill, model, or diagnostic status",
  "/settings          Open unified Shrimpy and Pi settings",
  "/model             Select the session model",
  "/thinking          Open session thinking menu",
  "/changelog         Show the Shrimpy changelog",
  "/shrimpy           This command list",
  "",
  "Pi commands remain available; Shrimpy adds the home-agent status and settings surface.",
];

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
  watches: "Watch inventory, next runs, recent runs, and expected wake opportunities",
  agents: "Active agent and configured agents",
  channels: "Channel log overview",
  context: "Context files and source inspection",
  skills: "Source, workspace, agent, and package skills",
  model: "Active model and model state paths",
  doctor: "Diagnostic command pointers",
};

export function installShrimpyCommandSurface(
  interactive: InteractiveMode,
  options: ShrimpyCommandSurfaceOptions,
): void {
  const mode = interactive as unknown as InteractiveModeCommandSurfaceInternals;
  const originalSetupEditorSubmitHandler = mode.setupEditorSubmitHandler.bind(mode);
  const originalHandleClearCommand = mode.handleClearCommand.bind(mode);

  mode.handleClearCommand = async () => {
    const previousSessionFile = mode.session.sessionFile;
    await originalHandleClearCommand();
    const currentSessionFile = mode.session.sessionFile;

    if (
      previousSessionFile &&
      previousSessionFile !== currentSessionFile
    ) {
      try {
        archiveSessionFile(previousSessionFile);
      } catch (err) {
        console.error("[tui] failed to archive previous session after /new:", err);
        mode.showStatus("New session started, but the previous session was not archived");
      }
    }
  };

  mode.handleChangelogCommand = () => {
    appendShrimpyChangelog(mode);
  };

  mode.setupEditorSubmitHandler = () => {
    originalSetupEditorSubmitHandler();
    const originalSubmit = mode.defaultEditor.onSubmit;

    mode.defaultEditor.onSubmit = async (text) => {
      const trimmed = text.trim();

      if (trimmed === "/share") {
        mode.editor.setText("");
        mode.showStatus("Share is hidden in Shrimpy for now");
        return;
      }

      if (trimmed === "/thinking") {
        mode.editor.setText("");
        showThinkingSelector(mode);
        return;
      }

      if (trimmed === "/shrimpy") {
        appendTextBlock(mode, HELP_LINES.join("\n"));
        mode.editor.setText("");
        return;
      }

      if (trimmed === "/status" || trimmed.startsWith("/status ")) {
        appendShrimpyStatus(mode, options, trimmed);
        mode.editor.setText("");
        return;
      }

      await originalSubmit?.(text);
    };
  };
}

function showThinkingSelector(mode: InteractiveModeCommandSurfaceInternals): void {
  const availableLevels = mode.session.getAvailableThinkingLevels() as ThinkingLevel[];
  const currentLevel = mode.session.thinkingLevel as ThinkingLevel;

  mode.showSelector((done) => {
    const selector = new ThinkingSelectorComponent(
      currentLevel,
      availableLevels,
      (level) => {
        mode.session.setThinkingLevel(level);
        mode.footer.invalidate();
        mode.updateEditorBorderColor();
        mode.showStatus(`Thinking level: ${mode.session.thinkingLevel}`);
        done();
      },
      () => done(),
    );
    return { component: selector, focus: selector.getSelectList() };
  });
}

function appendShrimpyStatus(
  mode: InteractiveModeCommandSurfaceInternals,
  options: ShrimpyCommandSurfaceOptions,
  commandText: string,
): void {
  appendTextBlock(
    mode,
    buildStatusText(mode, options, commandText.slice("/status".length)),
  );
}

function appendShrimpyChangelog(mode: InteractiveModeCommandSurfaceInternals): void {
  const changelogPath = join(projectRoot, "CHANGELOG.md");
  const changelogMarkdown = existsSync(changelogPath)
    ? readFileSync(changelogPath, "utf-8").trim()
    : "No Shrimpy changelog entries found.";

  mode.chatContainer.addChild(new Spacer(1));
  mode.chatContainer.addChild(new DynamicBorder());
  mode.chatContainer.addChild(new Text(theme.bold(theme.fg("accent", "What's New in Shrimpy")), 1, 0));
  mode.chatContainer.addChild(new Spacer(1));
  mode.chatContainer.addChild(new Markdown(changelogMarkdown, 1, 1, mode.getMarkdownThemeWithSettings()));
  mode.chatContainer.addChild(new DynamicBorder());
  mode.ui.requestRender();
}

function appendTextBlock(
  mode: InteractiveModeCommandSurfaceInternals,
  text: string,
): void {
  mode.chatContainer.addChild(new Spacer(1));
  mode.chatContainer.addChild(new Text(text, 1, 0));
  mode.ui.requestRender();
}

function buildStatusText(
  mode: InteractiveModeCommandSurfaceInternals,
  options: ShrimpyCommandSurfaceOptions,
  args: string,
): string {
  const section = parseStatusSection(args);
  if (!section) return unknownStatusText(args);

  switch (section) {
    case "overview":
      return overviewStatusText(mode, options);
    case "workspace":
      return workspaceStatusText(options);
    case "gateway":
      return gatewayStatusText(options);
    case "watches":
      return watchesStatusText(options);
    case "agents":
      return agentsStatusText(options);
    case "channels":
      return channelsStatusText(options);
    case "context":
      return contextStatusText(options);
    case "skills":
      return skillsStatusText(options);
    case "model":
      return modelStatusText(mode, options);
    case "doctor":
      return doctorStatusText(options);
  }
}

function overviewStatusText(
  mode: InteractiveModeCommandSurfaceInternals,
  options: ShrimpyCommandSurfaceOptions,
): string {
  const runtime = options.runtime;
  const service = readGatewayServiceStatus();
  return [
    theme.bold("Shrimpy Status"),
    "",
    label("Version", formatVersionLabel()),
    label("Agent", options.agentId),
    label("Gateway", formatGatewayServiceSummary(service)),
    label("Workspace", runtime.paths.workspace),
    label("CWD", options.cwd),
    label("Model", formatSessionModel(mode.session.model)),
    "",
    theme.bold("Sections"),
    ...STATUS_SECTIONS
      .filter((section) => section !== "overview")
      .map((section) => `${theme.fg("dim", `/status ${section}`)}  ${STATUS_SECTION_DESCRIPTIONS[section]}`),
  ].join("\n");
}

function workspaceStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const runtime = options.runtime;
  const agentPaths = runtime.getAgentPaths(options.agentId);
  return [
    theme.bold("Workspace"),
    "",
    label("Workspace", runtime.paths.workspace),
    label("Config", runtime.paths.primaryConfigPath),
    label("CWD", options.cwd),
    label("Agent", options.agentId),
    label("Agent root", agentPaths.root),
    "",
    theme.bold("Inspect"),
    "shrimpy status",
    "shrimpy context --sections",
  ].join("\n");
}

function gatewayStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const runtime = options.runtime;
  const service = readGatewayServiceStatus();
  const watchIds = loadGatewayWatchIds(runtime);
  const activity = collectGatewayActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
    watchIds,
  );
  const watchClock = loadGatewayWatchClockSummary(
    runtime.paths.watchClockStatePath,
    runtime.resolved.status,
    watchIds,
  );
  const lines = [
    theme.bold("Gateway"),
    "",
    label("Gateway manager", service.manager),
    label("Gateway service", service.active),
    label("Gateway enabled", service.enabled),
    ...(service.definitionPath ? [label("Gateway service file", service.definitionPath)] : []),
    label("Gateway log", runtime.paths.gatewayLogPath),
    ...(service.serviceLogPath ? [label("Gateway service log", service.serviceLogPath)] : []),
    label("Tracked channels", String(activity.channelCount)),
  ];

  lines.push(label("Last watch run", activity.lastWatchRun
    ? when(activity.lastWatchRun.message.timestamp)
    : dimText("(none)")));

  lines.push(label("Last user interaction", activity.lastUserInteraction
    ? when(activity.lastUserInteraction.message.timestamp)
    : dimText("(none)")));

  if (activity.lastUserInteraction) {
    lines.push(
      label(
        "Last interaction source",
        formatInteractionSource(activity.lastUserInteraction),
      ),
    );
  }

  lines.push(label("Next watch run due", watchClock.nextWatchRun === undefined
    ? dimText("(unknown)")
    : `${formatFutureOrPast(watchClock.nextWatchRun.nextRunAtMs)} ${dimText(`(${new Date(watchClock.nextWatchRun.nextRunAtMs).toLocaleString()})`)}`));

  lines.push(
    "",
    theme.bold("Inspect"),
    "shrimpy gateway status",
    "shrimpy gateway logs",
  );
  return lines.join("\n");
}

function watchesStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const watches = inspectWatches(options.runtime);
  const activeAgentWatches = watches.filter((watch) =>
    watch.ownerAgentId === options.agentId
  );
  const next = watches
    .filter((watch) => watch.nextRunAtMs !== undefined)
    .sort((a, b) => (a.nextRunAtMs ?? 0) - (b.nextRunAtMs ?? 0))[0];
  const recent = watches
    .filter((watch) => watch.lastRun)
    .sort((a, b) =>
      (b.lastRun?.finishedAtMs ?? 0) - (a.lastRun?.finishedAtMs ?? 0)
    )[0];
  const ordered = [
    ...activeAgentWatches,
    ...watches.filter((watch) => watch.ownerAgentId !== options.agentId),
  ];

  const lines = [
    theme.bold("Watches"),
    "",
    label("Configured", String(watches.length)),
    label(`Agent ${options.agentId}`, String(activeAgentWatches.length)),
    label("Next due", next?.nextRunAtMs === undefined
      ? dimText("(unknown)")
      : `${next.id} ${formatFutureOrPast(next.nextRunAtMs)}`),
    label("Last run", recent?.lastRun
      ? `${recent.id} ${recent.lastRun.status} ${when(recent.lastRun.finishedAtMs)}`
      : dimText("(none)")),
    "",
    theme.bold("Inventory"),
  ];

  if (ordered.length === 0) {
    lines.push("(none)");
  } else {
    for (const watch of ordered.slice(0, 10)) {
      lines.push(formatWatchSummaryLine(watch, options.agentId));
    }
    if (ordered.length > 10) {
      lines.push(`... ${ordered.length - 10} more`);
    }
  }

  lines.push(
    "",
    theme.bold("Inspect"),
    "shrimpy watches",
    `shrimpy watches --agent ${options.agentId}`,
    "shrimpy watches show <agent-id>/<watch-id>",
    "shrimpy watches history <agent-id>/<watch-id>",
    "shrimpy watches run <agent-id>/<watch-id>",
  );
  return lines.join("\n");
}

function agentsStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const runtime = options.runtime;
  const lines = [
    theme.bold("Agents"),
    "",
    label("Active", options.agentId),
  ];

  for (const agent of runtime.resolved.agents) {
    const marker = agent.id === options.agentId ? "*" : "-";
    const tools = agent.tools?.join(",") ?? "default";
    const thinking = agent.thinking ?? "inherit";
    const modelPolicy = agent.modelPolicy ?? DEFAULT_MODEL_POLICY;
    lines.push(`${marker} ${agent.id} root=${agent.root} tools=${tools} thinking=${thinking} model_policy=${modelPolicy}`);
  }

  lines.push("", theme.bold("Inspect"), "shrimpy agent list", `shrimpy agent show ${options.agentId}`);
  return lines.join("\n");
}

function formatWatchSummaryLine(
  watch: WatchInspection,
  activeAgentId: string,
): string {
  const marker = watch.ownerAgentId === activeAgentId ? "*" : "-";
  const status = watch.enabled ? "enabled" : "disabled";
  const turns = watch.expectedTurnAgentIds.join(",") || "(none)";
  const target = watch.targetChannels.join(",") || "(none)";
  const next = watch.nextRunAtMs === undefined
    ? "next=unknown"
    : `next=${formatFutureOrPast(watch.nextRunAtMs)}`;
  const diagnostic = watch.diagnostics.length > 0
    ? ` warnings=${watch.diagnostics.length}`
    : "";
  return `${marker} ${watch.id} ${status} ${watch.triggerText} action=${watch.actionKind} -> ${target} turns=${turns} ${next}${diagnostic}`;
}

function channelsStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const channelsDir = options.runtime.paths.channelsDir;
  const files = existsSync(channelsDir)
    ? readdirSync(channelsDir).filter((file) => file.endsWith(".jsonl")).sort()
    : [];
  const lines = [theme.bold("Channels"), ""];

  if (files.length === 0) {
    lines.push("(none)");
  } else {
    for (const file of files.slice(0, 12)) {
      const name = basename(file, ".jsonl");
      const path = join(channelsDir, file);
      lines.push(`${name} ${countLines(path)} msgs`);
    }
    if (files.length > 12) lines.push(`... ${files.length - 12} more`);
  }

  lines.push("", theme.bold("Inspect"), "shrimpy channels", "shrimpy channels read <name> --limit 20");
  return lines.join("\n");
}

function contextStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const agentPaths = options.runtime.getAgentPaths(options.agentId);
  return [
    theme.bold("Context"),
    "",
    label("Agent context", agentPaths.contextDir),
    label("Agent soul", agentPaths.soulPath),
    "",
    theme.bold("Inspect"),
    `shrimpy context files list --agent ${options.agentId}`,
    `shrimpy context sources list --agent ${options.agentId}`,
    `shrimpy context turn --agent ${options.agentId}`,
  ].join("\n");
}

function skillsStatusText(options: ShrimpyCommandSurfaceOptions): string {
  const inventory = inspectSkills(options.runtime, options.agentId);
  const lines = [theme.bold("Skills"), ""];

  if (inventory.skills.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...inventory.skills.slice(0, 16).map((skill) => {
      const name = skill.name !== skill.id ? ` name=${skill.name}` : "";
      const loaded = skill.loaded ? "" : " (not loaded by Pi)";
      return `${skill.id} [${skill.scope}]${name}${loaded}`;
    }));
    if (inventory.skills.length > 16) {
      lines.push(`... ${inventory.skills.length - 16} more`);
    }
    for (const warning of inventory.warnings) {
      lines.push(`warning: ${warning}`);
    }
  }

  lines.push("", theme.bold("Inspect"), `shrimpy skills list --agent ${options.agentId}`);
  return lines.join("\n");
}

function modelStatusText(
  mode: InteractiveModeCommandSurfaceInternals,
  options: ShrimpyCommandSurfaceOptions,
): string {
  const runtime = options.runtime;
  return [
    theme.bold("Model"),
    "",
    label("Active", formatSessionModel(mode.session.model)),
    label("Agent policy", options.runtime.getAgent(options.agentId).modelPolicy ?? DEFAULT_MODEL_POLICY),
    label("Auth state", runtime.paths.authPath),
    label("Model state", runtime.paths.modelsPath),
    "",
    theme.bold("Inspect"),
    "Use Pi /model for live selection",
    "Use Pi /login for provider auth",
    "shrimpy models resolve --session tui",
  ].join("\n");
}

function doctorStatusText(options: ShrimpyCommandSurfaceOptions): string {
  return [
    theme.bold("Doctor"),
    "",
    "Diagnostics are CLI-first until DOCTOR-001 grows a dedicated session.",
    "",
    theme.bold("Run"),
    "shrimpy status",
    "shrimpy context --sections",
    `shrimpy agent show ${options.agentId}`,
    "shrimpy channels",
  ].join("\n");
}

function unknownStatusText(args: string): string {
  const requested = args.trim() || "(empty)";
  return [
    theme.bold("Shrimpy Status"),
    "",
    `Unknown section: ${requested}`,
    "",
    theme.bold("Sections"),
    ...STATUS_SECTIONS.map((section) => `${section} - ${STATUS_SECTION_DESCRIPTIONS[section]}`),
  ].join("\n");
}

function parseStatusSection(args: string): StatusSection | undefined {
  const trimmed = args.trim().toLowerCase();
  if (trimmed.length === 0) return "overview";
  if (!STATUS_SECTIONS.includes(trimmed as StatusSection)) return undefined;
  return trimmed as StatusSection;
}

function label(name: string, value: string): string {
  return `${theme.fg("dim", `${name}:`)} ${value}`;
}

function dimText(text: string): string {
  return theme.fg("dim", text);
}

function formatInteractionSource(snapshot: ChannelMessageSnapshot): string {
  const sender = snapshot.message.sender.displayName
    ? `${snapshot.message.sender.kind}:${snapshot.message.sender.displayName}`
    : `${snapshot.message.sender.kind}:${snapshot.message.sender.actorId}`;
  return `${snapshot.channel} ${dimText(`(${sender})`)}`;
}

function when(ms: number): string {
  return `${timeSince(ms)} ${dimText(`(${new Date(ms).toLocaleString()})`)}`;
}

function formatSessionModel(model: unknown): string {
  const candidate = model as { provider?: string; modelId?: string; id?: string; name?: string } | undefined;
  if (!candidate) return "(none selected)";
  return `${candidate.provider ?? "provider?"}/${candidate.modelId ?? candidate.id ?? candidate.name ?? "model?"}`;
}

function countLines(path: string): number {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, "utf-8");
  if (!text) return 0;
  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
}
