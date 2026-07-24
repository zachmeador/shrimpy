import {
  removeAgent,
  renameAgent,
} from "../../agents/operations.js";
import { createAppRuntime } from "../../app/runtime.js";
import type { ShrimpyConfig } from "../../config/load.js";
import {
  parseCommandArgs,
  requireArg,
} from "../framework.js";

export async function cmdAgentRemove(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      "delete-files": { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const agentId = requireArg(positionals[0], usage, "agent id");

  const runtime = createAppRuntime(config);
  const result = removeAgent(runtime, {
    agentId,
    deleteFiles: values["delete-files"] ?? false,
  });

  if (json) {
    console.log(JSON.stringify({
      action: "remove",
      agentId,
      ...result,
    }, null, 2));
    return 0;
  }

  console.log(`removed agent ${agentId}`);
  console.log(`config: ${result.configPath}`);
  console.log(`removed_from_channels: ${result.removedFromChannels.join(",") || "(none)"}`);
  console.log(`cleared_surface_threads: ${result.clearedSurfaceThreadCount}`);
  if (result.deletedPaths.length > 0) {
    console.log(`deleted_paths: ${result.deletedPaths.join(", ")}`);
  } else {
    console.log(`retained_root: ${result.rootPath}`);
  }

  return 0;
}

export async function cmdAgentRename(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const fromAgentId = requireArg(args[0], usage, "old agent id");
  const toAgentId = requireArg(args[1], usage, "new agent id");

  const runtime = createAppRuntime(config);
  const result = renameAgent(runtime, {
    fromAgentId,
    toAgentId,
  });

  if (json) {
    console.log(JSON.stringify({
      action: "rename",
      fromAgentId,
      toAgentId,
      ...result,
    }, null, 2));
    return 0;
  }

  console.log(`renamed agent ${fromAgentId} -> ${toAgentId}`);
  console.log(`config: ${result.configPath}`);
  console.log(`root: ${result.rootPath}`);
  console.log(`updated_channels: ${result.updatedChannels.join(",") || "(none)"}`);
  console.log(`updated_surface_threads: ${result.updatedSurfaceThreadCount}`);
  if (result.movedPaths.length > 0) {
    console.log(
      `moved_paths: ${result.movedPaths.map((move) => `${move.from} -> ${move.to}`).join(", ")}`,
    );
  }

  return 0;
}
