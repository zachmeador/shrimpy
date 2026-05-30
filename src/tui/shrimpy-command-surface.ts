import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
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
import type { AppRuntime } from "../app/runtime.js";
import { projectRoot } from "../app/project-root.js";
import { formatModelSelection } from "../config/model.js";

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
  footer: {
    invalidate(): void;
  };
  showStatus(message: string): void;
  getMarkdownThemeWithSettings(): MarkdownTheme;
  updateEditorBorderColor(): void;
}

export interface ShrimpyCommandSurfaceOptions {
  runtime: AppRuntime;
  agentId: string;
  channel: string;
  sessionType: string;
  cwd: string;
}

const HELP_LINES = [
  "Shrimpy commands",
  "",
  "/status [section]  Show Shrimpy workspace, agent, channel, context, skill, model, or diagnostic status",
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
  agents: "Active agent and configured agents",
  channels: "Channel log overview",
  context: "Context files and source inspection",
  skills: "Workspace and agent skills",
  model: "Active model and model state paths",
  doctor: "Diagnostic command pointers",
};

export function installShrimpyCommandSurface(
  interactive: InteractiveMode,
  options: ShrimpyCommandSurfaceOptions,
): void {
  const mode = interactive as unknown as InteractiveModeCommandSurfaceInternals;
  const originalSetupEditorSubmitHandler = mode.setupEditorSubmitHandler.bind(mode);

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
  return [
    theme.bold("Shrimpy Status"),
    "",
    label("Agent", options.agentId),
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
    const model = agent.model ? formatModelSelection(agent.model) : "workspace";
    lines.push(`${marker} ${agent.id} root=${agent.root} tools=${tools} thinking=${thinking} model=${model}`);
  }

  lines.push("", theme.bold("Inspect"), "shrimpy agent list", `shrimpy agent show ${options.agentId}`);
  return lines.join("\n");
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
  const runtime = options.runtime;
  const agentPaths = runtime.getAgentPaths(options.agentId);
  const workspaceSkillsDir = join(runtime.paths.workspace, "skills");
  const skills = [
    ...listSkills(workspaceSkillsDir, workspaceSkillsDir, "workspace"),
    ...listSkills(agentPaths.skillsDir, agentPaths.skillsDir, "agent"),
  ];
  const lines = [theme.bold("Skills"), ""];

  if (skills.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...skills.slice(0, 16));
    if (skills.length > 16) lines.push(`... ${skills.length - 16} more`);
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
    label("Auth state", runtime.paths.authPath),
    label("Model state", runtime.paths.modelsPath),
    "",
    theme.bold("Inspect"),
    "Use Pi /model for live selection",
    "Use Pi /login for provider auth",
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

function listSkills(root: string, relativeRoot: string, scope: "agent" | "workspace"): string[] {
  if (!existsSync(root)) return [];
  return walkSkillRoots(root).map((skillRoot) => {
    const id = relative(relativeRoot, skillRoot).replaceAll("\\", "/");
    return `${id} [${scope}]`;
  });
}

function walkSkillRoots(root: string): string[] {
  const found: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const entryPath = join(current, "SKILL.md");
    if (existsSync(entryPath)) {
      found.push(current);
      continue;
    }

    for (const name of readdirSync(current).sort().reverse()) {
      const child = join(current, name);
      if (statSync(child).isDirectory()) stack.push(child);
    }
  }

  return found.sort();
}
