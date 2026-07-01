import {
  addAgent,
  updateAgent,
} from "../agents/service.js";
import { createAppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  DEFAULT_AGENT_TOOLS,
  parseChannelPolicyMode,
  parseCsv,
  parseThinking,
} from "./agent-helpers.js";
import {
  parseCommandArgs,
  printError,
  requireArg,
} from "./framework.js";

export async function cmdAgentAdd(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      root: { type: "string" },
      cwd: { type: "string" },
      "model-policy": { type: "string" },
      tools: { type: "string" },
      "disable-tools": { type: "string" },
      thinking: { type: "string" },
      "channel-policy": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");

  const runtime = createAppRuntime(config);
  const defaultAgent = runtime.resolved.agents[0];
  const result = addAgent(runtime, {
    agentId,
    root: values.root,
    cwd: values.cwd,
    ...(values["model-policy"] !== undefined ? { modelPolicy: values["model-policy"] } : {}),
    tools: parseCsv(values.tools) ?? [...(defaultAgent.tools ?? DEFAULT_AGENT_TOOLS)],
    disabledTools: parseCsv(values["disable-tools"]) ?? [...(defaultAgent.disabledTools ?? [])],
    thinking: parseThinking(values.thinking),
    ...(values["channel-policy"] !== undefined
      ? { channelPolicy: { mode: parseChannelPolicyMode(values["channel-policy"]) } }
      : {}),
  });

  if (json) {
    console.log(JSON.stringify({
      action: "add",
      agentId,
      ...result,
    }, null, 2));
    return 0;
  }

  console.log(`added agent ${agentId}`);
  console.log(`config: ${result.configPath}`);
  console.log(`root: ${result.rootPath}`);

  return 0;
}

export async function cmdAgentSet(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      root: { type: "string" },
      cwd: { type: "string" },
      "model-policy": { type: "string" },
      tools: { type: "string" },
      "disable-tools": { type: "string" },
      thinking: { type: "string" },
      "channel-policy": { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");

  if (
    values.root === undefined
    && values.cwd === undefined
    && values["model-policy"] === undefined
    && values.tools === undefined
    && values["disable-tools"] === undefined
    && values.thinking === undefined
    && values["channel-policy"] === undefined
  ) {
    return printError("agent set requires at least one field to update");
  }

  const runtime = createAppRuntime(config);
  const result = updateAgent(runtime, {
    agentId,
    ...(values.root !== undefined ? { root: values.root } : {}),
    ...(values.cwd !== undefined ? { cwd: values.cwd } : {}),
    ...(values["model-policy"] !== undefined ? { modelPolicy: values["model-policy"] } : {}),
    ...(values.tools !== undefined ? { tools: parseCsv(values.tools) ?? [] } : {}),
    ...(values["disable-tools"] !== undefined
      ? { disabledTools: parseCsv(values["disable-tools"]) ?? [] }
      : {}),
    ...(values.thinking !== undefined ? { thinking: parseThinking(values.thinking) } : {}),
    ...(values["channel-policy"] !== undefined
      ? { channelPolicy: { mode: parseChannelPolicyMode(values["channel-policy"]) } }
      : {}),
  });

  if (json) {
    console.log(JSON.stringify({
      action: "set",
      agentId,
      ...result,
    }, null, 2));
    return 0;
  }

  console.log(`updated agent ${agentId}`);
  console.log(`config: ${result.configPath}`);
  console.log(`root: ${result.rootPath}`);
  if (result.movedPaths.length > 0) {
    console.log(
      `moved_paths: ${result.movedPaths.map((move) => `${move.from} -> ${move.to}`).join(", ")}`,
    );
  }

  return 0;
}
