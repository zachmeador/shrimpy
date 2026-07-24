import { createAppRuntime } from "../app/runtime.js";
import { createWorkspaceCheckpoint, initializeWorkspaceCheckpointTracking, inspectWorkspaceCheckpointStatus, type WorkspaceCheckpointStatus } from "../workspace/checkpoints/git.js";
import {
  inspectWorkspaceSearchIndex,
  rebuildWorkspaceSearchIndex,
  searchWorkspaceKnowledge,
  type WorkspaceIndexStatus,
  type WorkspaceSearchResult,
} from "../workspace/search.js";
import { parsePositiveInt } from "../util/parse.js";
import { accent, dim, label } from "../util/style.js";
import { renderGroupUsage } from "./catalog.js";
import {
  createCommandGroup,
  parseCommandArgs,
  requireArg,
  usage as printUsage,
  type CommandHandler,
} from "./framework.js";

const USAGE = renderGroupUsage("workspace");

const cmdWorkspaceTrack: CommandHandler = createCommandGroup({
  name: "track",
  path: ["workspace", "track"],
  usage: USAGE,
  default: () => printUsage(USAGE, "track subcommand required"),
  commands: {
    init: ({ argv, config }) => cmdWorkspaceTrackInit(argv, config),
    status: ({ argv, config }) => cmdWorkspaceTrackStatus(argv, config),
    checkpoint: ({ argv, config }) => cmdWorkspaceTrackCheckpoint(argv, config),
  },
});

const cmdWorkspaceIndex: CommandHandler = createCommandGroup({
  name: "index",
  path: ["workspace", "index"],
  usage: USAGE,
  default: () => printUsage(USAGE, "index subcommand required"),
  commands: {
    status: ({ argv, config }) => cmdWorkspaceIndexStatus(argv, config),
    rebuild: ({ argv, config }) => cmdWorkspaceIndexRebuild(argv, config),
  },
});

export const cmdWorkspace: CommandHandler = createCommandGroup({
  name: "workspace",
  usage: USAGE,
  default: () => printUsage(USAGE),
  commands: {
    search: ({ argv, config }) => cmdWorkspaceSearch(argv, config),
    index: ({ argv, config }) => cmdWorkspaceIndex(argv, config),
    track: ({ argv, config }) => cmdWorkspaceTrack(argv, config),
  },
});

async function cmdWorkspaceSearch(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      limit: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });
  const query = positionals.join(" ").trim();
  requireArg(query, USAGE, "query");
  const runtime = createAppRuntime(config);
  const result = await searchWorkspaceKnowledge(runtime, {
    query,
    limit: values.limit ? parsePositiveInt(values.limit, "--limit") : undefined,
  });

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  printWorkspaceSearchResult(result);
  return 0;
}

async function cmdWorkspaceIndexStatus(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage: USAGE,
  });
  const runtime = createAppRuntime(config);
  const status = inspectWorkspaceSearchIndex(runtime);

  if (values.json) {
    console.log(JSON.stringify(status, null, 2));
    return 0;
  }

  printWorkspaceSearchIndexStatus(status);
  return 0;
}

async function cmdWorkspaceIndexRebuild(argv: string[], config: Parameters<CommandHandler>[1]): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage: USAGE,
  });
  const runtime = createAppRuntime(config);
  const result = rebuildWorkspaceSearchIndex(runtime);

  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(`${label("workspace index:")} rebuilt`);
  console.log(`${label("path:")} ${result.indexPath}`);
  console.log(`${label("corpus files:")} ${result.corpusFiles}`);
  console.log(`${label("indexed chunks:")} ${result.index.files.reduce((count, file) => count + file.chunks.length, 0)}`);
  return 0;
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

export function printWorkspaceSearchResult(result: WorkspaceSearchResult): void {
  console.log(
    `${label("workspace:")} ${result.matchedCount}/${result.indexedChunks} matches  ${dim(`files=${result.corpusFiles} showing=${result.returnedCount}`)}`,
  );
  if (result.embedding.enabled && !result.embedding.available) {
    console.log(`${label("embeddings:")} ${dim(result.embedding.note)}`);
  }
  if (result.results.length === 0) {
    console.log(dim("(no matches)"));
    for (const hint of result.hints) {
      console.log(`  ${dim(hint)}`);
    }
    return;
  }

  for (const item of result.results) {
    const heading = item.headingTrail.length > 0
      ? ` ${dim(item.headingTrail.join(" > "))}`
      : "";
    console.log(
      `${accent(item.path)}:${item.lineStart}  score=${item.score}${heading}`,
    );
    console.log(`  ${item.snippet}`);
  }
}

export function printWorkspaceSearchIndexStatus(status: WorkspaceIndexStatus): void {
  const state = status.needsRebuild ? "stale" : "fresh";
  console.log(`${label("workspace index:")} ${status.exists ? state : "missing"}`);
  console.log(`${label("path:")} ${status.indexPath}`);
  console.log(`${label("corpus files:")} ${status.corpusFiles}`);
  console.log(`${label("indexed files:")} ${status.indexedFiles}`);
  console.log(`${label("indexed chunks:")} ${status.indexedChunks}`);
  console.log(`${label("scorer:")} ${status.scorerId} ${dim(`expected=${status.expectedScorerId}`)}`);
  console.log(`${label("embeddings:")} ${status.embedding.note}`);
  if (status.generatedAt) console.log(`${label("generated:")} ${status.generatedAt}`);
  if (status.needsRebuild) {
    console.log(
      `${label("stale:")} stale=${status.staleFiles} unindexed=${status.unindexedFiles} removed=${status.removedFiles}`,
    );
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
