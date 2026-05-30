import {
  addAgent,
  updateAgent,
} from "../agents/service.js";
import { createAppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  DEFAULT_AGENT_TOOLS,
  parseAttentionMode,
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
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      tools: { type: "string" },
      "disable-tools": { type: "string" },
      thinking: { type: "string" },
      attention: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");
  if (values.provider !== undefined && values.model === undefined) {
    return printError("agent add --provider requires --model");
  }

  const runtime = createAppRuntime(config);
  const defaultAgent = runtime.resolved.agents[0];
  const result = addAgent(runtime, {
    agentId,
    root: values.root,
    ...(values.model !== undefined
      ? { model: { provider: values.provider, id: values.model } }
      : {}),
    tools: parseCsv(values.tools) ?? [...(defaultAgent.tools ?? DEFAULT_AGENT_TOOLS)],
    disabledTools: parseCsv(values["disable-tools"]) ?? [...(defaultAgent.disabledTools ?? [])],
    thinking: parseThinking(values.thinking),
    ...(values.attention !== undefined
      ? { attention: { mode: parseAttentionMode(values.attention) } }
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
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      tools: { type: "string" },
      "disable-tools": { type: "string" },
      thinking: { type: "string" },
      attention: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");
  if (values.provider !== undefined && values.model === undefined) {
    return printError("agent set --provider requires --model");
  }

  if (
    values.root === undefined
    && values.model === undefined
    && values.tools === undefined
    && values["disable-tools"] === undefined
    && values.thinking === undefined
    && values.attention === undefined
  ) {
    return printError("agent set requires at least one field to update");
  }

  const runtime = createAppRuntime(config);
  const result = updateAgent(runtime, {
    agentId,
    ...(values.root !== undefined ? { root: values.root } : {}),
    ...(values.model !== undefined
      ? { model: { provider: values.provider, id: values.model } }
      : {}),
    ...(values.tools !== undefined ? { tools: parseCsv(values.tools) ?? [] } : {}),
    ...(values["disable-tools"] !== undefined
      ? { disabledTools: parseCsv(values["disable-tools"]) ?? [] }
      : {}),
    ...(values.thinking !== undefined ? { thinking: parseThinking(values.thinking) } : {}),
    ...(values.attention !== undefined
      ? { attention: { mode: parseAttentionMode(values.attention) } }
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
