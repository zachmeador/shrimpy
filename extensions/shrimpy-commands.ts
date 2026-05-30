import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";

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

const STATUS_SECTION_DESCRIPTIONS: Record<(typeof STATUS_SECTIONS)[number], string> = {
  overview: "Workspace, active agent, model, and available status sections",
  workspace: "Workspace paths and config",
  agents: "Active agent and configured agents",
  channels: "Channel log overview",
  context: "Context files and source inspection",
  skills: "Workspace and agent skills",
  model: "Active model and model state paths",
  doctor: "Diagnostic command pointers",
};

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
    handler: async (_args, ctx) => {
      showTuiOnlyNotice(ctx, "/status");
    },
  });
}

export function registerShrimpyHelpCommand(pi: ExtensionAPI) {
  pi.registerCommand("shrimpy", {
    description: "Show Shrimpy command help",
    handler: async (_args, ctx) => {
      showTuiOnlyNotice(ctx, "/shrimpy");
    },
  });
}

function showTuiOnlyNotice(
  ctx: ExtensionCommandContext,
  command: "/shrimpy" | "/status",
): void {
  ctx.ui.notify(`${command} is rendered by the Shrimpy TUI command surface.`, "info");
}
