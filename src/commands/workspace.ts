import { createAppRuntime } from "../app/index.js";
import {
  createWorkspaceCheckpoint,
  initializeWorkspaceCheckpointTracking,
  inspectWorkspaceCheckpointStatus,
  type WorkspaceCheckpointStatus,
} from "../workspace-checkpoints/index.js";
import { dim, label } from "../util/style.js";
import { renderGroupUsage } from "./catalog.js";
import {
  parseCommandArgs,
  requireArg,
  usage as printUsage,
  type CommandHandler,
} from "./framework.js";

const USAGE = renderGroupUsage("workspace");

export const cmdWorkspace: CommandHandler = async (argv, config) => {
  const action = argv[0];
  if (action === "track") {
    return cmdWorkspaceTrack(argv.slice(1), config);
  }
  printUsage(USAGE, action ? `unknown subcommand: ${action}` : undefined);
};

async function cmdWorkspaceTrack(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const action = argv[0];
  if (action === "init") {
    return cmdWorkspaceTrackInit(argv.slice(1), config);
  }
  if (action === "status") {
    return cmdWorkspaceTrackStatus(argv.slice(1), config);
  }
  if (action === "checkpoint") {
    return cmdWorkspaceTrackCheckpoint(argv.slice(1), config);
  }
  printUsage(USAGE, action ? `unknown track subcommand: ${action}` : "track subcommand required");
}

async function cmdWorkspaceTrackInit(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage: USAGE,
  });
  const runtime = createAppRuntime(config);
  const result = initializeWorkspaceCheckpointTracking(runtime.paths.workspace);

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(`${label("workspace checkpoints:")} enabled`);
  console.log(`${label("repository created:")} ${String(result.repositoryCreated)}`);
  console.log(`${label("gitignore written:")} ${String(result.gitignoreWritten)}`);
  printCheckpointResult(result.checkpoint);
  return 0;
}

async function cmdWorkspaceTrackStatus(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage: USAGE,
  });
  const runtime = createAppRuntime(config);
  const status = inspectWorkspaceCheckpointStatus(runtime.paths.workspace);

  if (values.json) {
    console.log(JSON.stringify(status, null, 2));
    return 0;
  }

  printWorkspaceCheckpointStatus(status);
  return 0;
}

async function cmdWorkspaceTrackCheckpoint(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      message: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage: USAGE,
  });
  const message = requireArg(values.message, USAGE, "--message");
  const runtime = createAppRuntime(config);
  const result = createWorkspaceCheckpoint(runtime.paths.workspace, { message });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  printCheckpointResult(result);
  return 0;
}

export function printWorkspaceCheckpointStatus(status: WorkspaceCheckpointStatus): void {
  if (!status.enabled) {
    console.log(`${label("workspace checkpoints:")} ${dim("disabled")}`);
    return;
  }

  if (status.diagnostics.length > 0) {
    console.log(`${label("workspace checkpoints:")} diagnostics`);
    for (const diagnostic of status.diagnostics) {
      console.log(`  ${diagnostic}`);
    }
    return;
  }

  const state = status.clean ? "clean" : `${status.changedPaths.length} changed`;
  console.log(`${label("workspace checkpoints:")} enabled (${state})`);
  if (status.branch) console.log(`${label("checkpoint branch:")} ${status.branch}`);
  if (status.head) console.log(`${label("checkpoint head:")} ${status.head}`);
  for (const path of status.changedPaths.slice(0, 10)) {
    console.log(`  ${path}`);
  }
  if (status.changedPaths.length > 10) {
    console.log(`  ... ${status.changedPaths.length - 10} more`);
  }
}

function printCheckpointResult(result: {
  created: boolean;
  changedPaths: string[];
  commit?: string;
  message: string;
}): void {
  if (!result.created) {
    console.log(`${label("checkpoint:")} ${dim("skipped, no changes")}`);
    return;
  }

  console.log(`${label("checkpoint:")} ${result.commit ?? "(created)"}`);
  console.log(`${label("message:")} ${result.message}`);
  console.log(`${label("changed paths:")} ${result.changedPaths.length}`);
}
