import {
  getAgentView,
  listAgentViews,
} from "../agents/service.js";
import { createAppRuntime } from "../app/index.js";
import {
  formatModelSelection,
  type ShrimpyConfig,
} from "../config/index.js";
import { accent, dim } from "../util/style.js";
import { DEFAULT_AGENT_TOOLS } from "./agent-helpers.js";
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
    const tools = (agent.tools ?? DEFAULT_AGENT_TOOLS).join(",");
    const thinking = agent.thinking ?? "inherit";
    const model = agent.model ? formatModelSelection(agent.model) : "workspace";
    console.log(
      `${accent(agent.id)}  ${dim(`root=${agent.root}  tools=${tools}  thinking=${thinking}  model=${model}`)}`,
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
