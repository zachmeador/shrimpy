import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

const COMMAND_WIDGET_KEY = "shrimpy.commands";
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

type PanelBuilder = (runtime: CommandRuntime, ctx: ExtensionCommandContext) => string[];

const HELP_LINES = [
  "Shrimpy commands",
  "",
  "/workspace  Workspace paths and config",
  "/agents     Active agent and configured agents",
  "/channels   Channel log overview",
  "/context    Context files and source inspection",
  "/skills     Workspace and agent skills",
  "/models     Active model and model state paths",
  "/doctor     Diagnostic command pointers",
  "/shrimpy    This command list",
];

export default function (pi: ExtensionAPI) {
  registerPanelCommand(pi, "workspace", "Show Shrimpy workspace paths", workspacePanel);
  registerPanelCommand(pi, "agents", "Show Shrimpy agents", agentsPanel);
  registerPanelCommand(pi, "channels", "Show Shrimpy channel logs", channelsPanel);
  registerPanelCommand(pi, "context", "Show Shrimpy context pointers", contextPanel);
  registerPanelCommand(pi, "skills", "Show Shrimpy skills", skillsPanel);
  registerPanelCommand(pi, "models", "Show Shrimpy model state", modelsPanel);
  registerPanelCommand(pi, "doctor", "Show Shrimpy diagnostic commands", doctorPanel);
}

export function registerShrimpyHelpCommand(pi: ExtensionAPI) {
  pi.registerCommand("shrimpy", {
    description: "Show Shrimpy command help",
    handler: async (_args, ctx) => {
      showPanel(ctx, HELP_LINES);
    },
  });
}

function registerPanelCommand(
  pi: ExtensionAPI,
  name: string,
  description: string,
  buildPanel: PanelBuilder,
): void {
  pi.registerCommand(name, {
    description,
    handler: async (_args, ctx) => {
      showPanel(ctx, buildPanel(resolveRuntime(ctx), ctx));
    },
  });
}

function showPanel(ctx: ExtensionCommandContext, lines: string[]): void {
  ctx.ui.setWidget(COMMAND_WIDGET_KEY, lines, { placement: "aboveEditor" });
  ctx.ui.notify(`${lines[0]} shown`, "info");
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

function modelsPanel(runtime: CommandRuntime, ctx: ExtensionCommandContext): string[] {
  const model = ctx.model as unknown as { provider?: string; modelId?: string; id?: string; name?: string } | undefined;
  const modelLabel = model
    ? `${model.provider ?? "provider?"}/${model.modelId ?? model.id ?? model.name ?? "model?"}`
    : "(none selected)";

  return [
    "Models",
    "",
    `active: ${modelLabel}`,
    `auth state: ${join(runtime.workspacePath, "state", "pi", "auth.json")}`,
    `model state: ${join(runtime.workspacePath, "state", "pi", "models.json")}`,
    "",
    "Inspect:",
    "Use Pi /model for live selection",
    "Use Pi /login for provider auth",
  ];
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
