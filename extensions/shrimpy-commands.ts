import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import {
  getKeybindings,
  Key,
  matchesKey,
  truncateToWidth,
  type Component,
} from "@earendil-works/pi-tui";

const DEFAULT_AGENT_ID = "shrimpy";
const DEFAULT_AGENT_TOOLS = [
  "send_message",
  "read_channel",
  "run_child",
];

interface SessionMetadata {
  workspacePath: string;
  agentId: string;
  sessionType: string;
  channel?: string;
}

interface AgentView {
  id: string;
  root: string;
  model?: {
    provider?: string;
    id: string;
  };
  tools?: string[];
  thinking?: string;
}

interface CommandRuntime {
  workspacePath: string;
  agentId: string;
  agentRootPath: string;
  configPath: string;
  agents: AgentView[];
}

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

type PanelBuilder = (runtime: CommandRuntime, ctx: ExtensionCommandContext) => string[];
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

const STATUS_PANEL_BUILDERS: Record<StatusSection, PanelBuilder> = {
  overview: overviewPanel,
  workspace: workspacePanel,
  agents: agentsPanel,
  channels: channelsPanel,
  context: contextPanel,
  skills: skillsPanel,
  model: modelPanel,
  doctor: doctorPanel,
};

const HELP_LINES = [
  "Shrimpy commands",
  "",
  "/status [section]  Show Shrimpy workspace, agent, channel, context, skill, model, or diagnostic status",
  "/settings          Open unified Shrimpy and Pi settings",
  "/model             Select the session model",
  "/thinking <level>  Set the session thinking level",
  "/shrimpy           This command list",
  "",
  "Pi commands remain available; Shrimpy adds the home-agent status and settings surface.",
];

export default function (pi: ExtensionAPI) {
  pi.registerCommand("status", {
    description: "Show Shrimpy status",
    getArgumentCompletions: (prefix) => {
      const normalized = prefix.trim().toLowerCase();
      return STATUS_SECTIONS
        .filter((section) => normalized.length === 0 || section.startsWith(normalized))
        .map((section) => ({
          value: section,
          label: section,
          description: STATUS_SECTION_DESCRIPTIONS[section],
        }));
    },
    handler: async (args, ctx) => {
      const section = parseStatusSection(args);
      if (!section) {
        await showPanel(ctx, unknownStatusPanel(args));
        return;
      }

      await showPanel(ctx, STATUS_PANEL_BUILDERS[section](resolveRuntime(ctx), ctx));
    },
  });
}

export function registerShrimpyHelpCommand(pi: ExtensionAPI) {
  pi.registerCommand("shrimpy", {
    description: "Show Shrimpy command help",
    handler: async (_args, ctx) => {
      await showPanel(ctx, HELP_LINES);
    },
  });
}

async function showPanel(ctx: ExtensionCommandContext, lines: string[]): Promise<void> {
  await ctx.ui.custom<void>(
    (_tui, _theme, _keybindings, done) => new ShrimpyStatusPanel(lines, done),
  );
}

class ShrimpyStatusPanel implements Component {
  private closed = false;
  private readonly lines: string[];
  private readonly done: () => void;

  constructor(lines: string[], done: () => void) {
    this.lines = lines;
    this.done = done;
  }

  render(width: number): string[] {
    const contentWidth = Math.max(20, width - 2);
    return [
      "",
      ...this.lines.map((line) => truncateToWidth(line, contentWidth)),
      "",
      truncateToWidth("Esc/Ctrl+C close", contentWidth),
    ];
  }

  handleInput(data: string): void {
    if (this.closed) return;
    if (
      getKeybindings().matches(data, "tui.select.cancel") ||
      matchesKey(data, Key.escape) ||
      matchesKey(data, Key.ctrl("c"))
    ) {
      this.closed = true;
      this.done();
    }
  }

  invalidate(): void {
    // Static content.
  }
}

function parseStatusSection(args: string): StatusSection | undefined {
  const trimmed = args.trim().toLowerCase();
  if (trimmed.length === 0) return "overview";
  if (!STATUS_SECTIONS.includes(trimmed as StatusSection)) return undefined;
  return trimmed as StatusSection;
}

function unknownStatusPanel(args: string): string[] {
  const requested = args.trim() || "(empty)";
  return [
    "Status",
    "",
    `Unknown section: ${requested}`,
    "",
    "Sections:",
    ...STATUS_SECTIONS.map((section) => `${section} - ${STATUS_SECTION_DESCRIPTIONS[section]}`),
  ];
}

function resolveRuntime(ctx: ExtensionCommandContext): CommandRuntime {
  const metadata = readSessionMetadataFromContext(ctx);
  const workspacePath = metadata?.workspacePath ?? join(ctx.cwd, ".shrimpy");
  const configPath = join(workspacePath, "config", "shrimpy.json");
  const config = readJsonObject(configPath);
  const agents = resolveAgents(config);
  const agentId = metadata?.agentId ?? agents[0]?.id ?? DEFAULT_AGENT_ID;
  const agent = agents.find((candidate) => candidate.id === agentId) ?? agents[0];
  const agentRootPath = join(workspacePath, agent?.root ?? `agents/${agentId}`);

  return {
    workspacePath,
    agentId,
    agentRootPath,
    configPath,
    agents,
  };
}

function overviewPanel(runtime: CommandRuntime, ctx: ExtensionCommandContext): string[] {
  return [
    "Status",
    "",
    `agent: ${runtime.agentId}`,
    `workspace: ${runtime.workspacePath}`,
    `cwd: ${ctx.cwd}`,
    `model: ${formatModel(ctx.model)}`,
    "",
    "Sections:",
    ...STATUS_SECTIONS
      .filter((section) => section !== "overview")
      .map((section) => `/status ${section} - ${STATUS_SECTION_DESCRIPTIONS[section]}`),
  ];
}

function workspacePanel(runtime: CommandRuntime, ctx: ExtensionCommandContext): string[] {
  return [
    "Workspace",
    "",
    `workspace: ${runtime.workspacePath}`,
    `config: ${runtime.configPath}`,
    `cwd: ${ctx.cwd}`,
    `agent: ${runtime.agentId}`,
    `agent root: ${runtime.agentRootPath}`,
    "",
    "Inspect:",
    "shrimpy status",
    "shrimpy context --sections",
  ];
}

function agentsPanel(runtime: CommandRuntime): string[] {
  const lines = [
    "Agents",
    "",
    `active: ${runtime.agentId}`,
  ];

  for (const agent of runtime.agents) {
    const marker = agent.id === runtime.agentId ? "*" : "-";
    const tools = (agent.tools ?? DEFAULT_AGENT_TOOLS).join(",");
    const thinking = agent.thinking ?? "inherit";
    const model = agent.model
      ? agent.model.provider
        ? `${agent.model.provider}/${agent.model.id}`
        : agent.model.id
      : "workspace";
    lines.push(`${marker} ${agent.id} root=${agent.root} tools=${tools} thinking=${thinking} model=${model}`);
  }

  lines.push("", "Inspect:", "shrimpy agent list", `shrimpy agent show ${runtime.agentId}`);
  return lines;
}

function channelsPanel(runtime: CommandRuntime): string[] {
  const channelsDir = join(runtime.workspacePath, "channels");
  const files = existsSync(channelsDir)
    ? readdirSync(channelsDir).filter((file) => file.endsWith(".jsonl")).sort()
    : [];
  const lines = ["Channels", ""];

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

  lines.push("", "Inspect:", "shrimpy channels", "shrimpy channels read <name> --limit 20");
  return lines;
}

function contextPanel(runtime: CommandRuntime): string[] {
  return [
    "Context",
    "",
    `agent context: ${join(runtime.agentRootPath, "context")}`,
    `agent soul: ${join(runtime.agentRootPath, "SOUL.md")}`,
    "",
    "Inspect:",
    `shrimpy context files list --agent ${runtime.agentId}`,
    `shrimpy context sources list --agent ${runtime.agentId}`,
    `shrimpy context turn --agent ${runtime.agentId}`,
  ];
}

function skillsPanel(runtime: CommandRuntime): string[] {
  const skills = [
    ...listSkills(join(runtime.workspacePath, "skills"), "workspace"),
    ...listSkills(join(runtime.agentRootPath, "skills"), "agent"),
  ];
  const lines = ["Skills", ""];

  if (skills.length === 0) {
    lines.push("(none)");
  } else {
    lines.push(...skills.slice(0, 16));
    if (skills.length > 16) lines.push(`... ${skills.length - 16} more`);
  }

  lines.push("", "Inspect:", `shrimpy skills list --agent ${runtime.agentId}`);
  return lines;
}

function modelPanel(runtime: CommandRuntime, ctx: ExtensionCommandContext): string[] {
  return [
    "Model",
    "",
    `active: ${formatModel(ctx.model)}`,
    `auth state: ${join(runtime.workspacePath, "state", "pi", "auth.json")}`,
    `model state: ${join(runtime.workspacePath, "state", "pi", "models.json")}`,
    "",
    "Inspect:",
    "Use Pi /model for live selection",
    "Use Pi /login for provider auth",
  ];
}

function formatModel(model: unknown): string {
  const candidate = model as { provider?: string; modelId?: string; id?: string; name?: string } | undefined;
  if (!candidate) return "(none selected)";
  return `${candidate.provider ?? "provider?"}/${candidate.modelId ?? candidate.id ?? candidate.name ?? "model?"}`;
}

function doctorPanel(runtime: CommandRuntime): string[] {
  return [
    "Doctor",
    "",
    "Diagnostics are CLI-first until DOCTOR-001 grows a dedicated session.",
    "",
    "Run:",
    "shrimpy status",
    "shrimpy context --sections",
    `shrimpy agent show ${runtime.agentId}`,
    "shrimpy channels",
  ];
}

function resolveAgents(config: Record<string, unknown>): AgentView[] {
  if (!Array.isArray(config.agents) || config.agents.length === 0) {
    return [{
      id: DEFAULT_AGENT_ID,
      root: `agents/${DEFAULT_AGENT_ID}`,
    }];
  }

  return config.agents.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string") return [];
    const id = entry.id;
    return [{
      id,
      root: typeof entry.root === "string" ? entry.root : `agents/${id}`,
      tools: Array.isArray(entry.tools)
        ? entry.tools.filter((tool): tool is string => typeof tool === "string")
        : undefined,
      thinking: typeof entry.thinking === "string" ? entry.thinking : undefined,
    }];
  });
}

function readSessionMetadataFromContext(
  ctx: ExtensionCommandContext,
): SessionMetadata | undefined {
  const entries = ctx.sessionManager.getEntries();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i] as unknown;
    if (!isRecord(entry) || entry.type !== "custom") continue;
    if (entry.customType !== "shrimpy_session_metadata") continue;
    return parseSessionMetadata(entry.data);
  }
  return undefined;
}

function parseSessionMetadata(value: unknown): SessionMetadata | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.workspacePath !== "string") return undefined;
  if (typeof value.agentId !== "string") return undefined;
  if (typeof value.sessionType !== "string") return undefined;
  return {
    workspacePath: value.workspacePath,
    agentId: value.agentId,
    sessionType: value.sessionType,
    channel: typeof value.channel === "string" ? value.channel : undefined,
  };
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function countLines(path: string): number {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, "utf-8");
  if (!text) return 0;
  return text.endsWith("\n") ? text.split("\n").length - 1 : text.split("\n").length;
}

function listSkills(root: string, scope: "agent" | "workspace"): string[] {
  if (!existsSync(root)) return [];
  return walkSkillRoots(root).map((skillRoot) => {
    const id = relative(root, skillRoot).replaceAll("\\", "/");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
