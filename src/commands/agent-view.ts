import {
  getAgentView,
  listAgentViews,
} from "../agents/service.js";
import { createAppRuntime } from "../app/index.js";
import {
  DEFAULT_MODEL_POLICY,
  type ShrimpyConfig,
} from "../config/index.js";
import { accent, dim } from "../util/style.js";
import type { ToolCapabilityView } from "../tools/index.js";
import { requireArg } from "./framework.js";

export async function cmdAgentList(
  config: ShrimpyConfig,
  json: boolean,
): Promise<number> {
  const runtime = createAppRuntime(config);
  const agents = listAgentViews(runtime);

  if (json) {
    console.log(JSON.stringify(agents, null, 2));
    return 0;
  }

  for (const agent of agents) {
    const daemonTools = agent.toolPolicy.daemonToolNames.join(",");
    const piActiveTools = agent.toolPolicy.capabilities
      .filter((tool) => tool.origin === "pi_builtin" && tool.active)
      .map((tool) => tool.name)
      .join(",");
    const disabledTools = agent.toolPolicy.disabledToolNames.join(",") || "none";
    const thinking = agent.thinking ?? "inherit";
    const modelPolicy = agent.modelPolicy ?? DEFAULT_MODEL_POLICY;
    console.log(
      `${accent(agent.id)}  ${
        dim(
          `root=${agent.root}  daemon_tools=${daemonTools}  pi_active=${piActiveTools}  disabled=${disabledTools}  thinking=${thinking}  model_policy=${modelPolicy}`,
        )
      }`,
    );
  }

  return 0;
}

export async function cmdAgentShow(
  config: ShrimpyConfig,
  agentId: string | undefined,
  usage: string,
): Promise<number> {
  const id = requireArg(agentId, usage, "agent id");

  const runtime = createAppRuntime(config);
  console.log(JSON.stringify(getAgentView(runtime, id), null, 2));
  return 0;
}

export async function cmdAgentInspect(
  config: ShrimpyConfig,
  agentId: string | undefined,
  json: boolean,
  usage: string,
): Promise<number> {
  const id = requireArg(agentId, usage, "agent id");

  const runtime = createAppRuntime(config);
  const view = getAgentView(runtime, id);

  if (json) {
    console.log(JSON.stringify(view, null, 2));
    return 0;
  }

  const thinking = view.thinking ?? "inherit";
  const modelPolicy = view.modelPolicy ?? DEFAULT_MODEL_POLICY;
  const active = view.toolPolicy.capabilities.filter((tool) => tool.active);
  const registeredInactive = view.toolPolicy.capabilities.filter((tool) =>
    tool.registered && !tool.active && !tool.excluded
  );
  const excluded = view.toolPolicy.capabilities.filter((tool) => tool.excluded);

  console.log(accent(view.id));
  console.log(`root: ${view.root}`);
  console.log(`model_policy: ${modelPolicy}`);
  console.log(`thinking: ${thinking}`);
  console.log("tools:");
  console.log(`  active: ${formatToolList(active)}`);
  console.log(`  registered_inactive: ${formatToolList(registeredInactive)}`);
  console.log(`  excluded: ${formatToolList(excluded)}`);

  return 0;
}

function formatToolList(tools: ToolCapabilityView[]): string {
  if (tools.length === 0) return "(none)";
  return tools.map((tool) => `${tool.name} (${formatToolOrigin(tool)})`).join(", ");
}

function formatToolOrigin(tool: ToolCapabilityView): string {
  if (tool.origin === "pi_builtin") return "pi built-in";
  if (tool.origin === "shrimpy_daemon") return "shrimpy daemon";
  return "unknown";
}
