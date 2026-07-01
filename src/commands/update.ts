import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { createAppRuntime } from "../app/index.js";
import { readAppMetadata } from "../app/metadata.js";
import { projectRoot } from "../app/project-root.js";
import { createWorkspacePaths } from "../app/paths.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  readGatewayServiceStatus,
} from "../gateway/service-ctl.js";
import {
  resolveSessionModel,
} from "../sessions/index.js";
import {
  parseCommandArgs,
  printError,
  type CommandHandler,
} from "./framework.js";

interface UpdatePreflight {
  dryRun: boolean;
  workspace: string;
  install: {
    appRoot: string;
    binaryTarget?: string;
    version: string;
    releaseName?: string;
    git?: {
      commit?: string;
      branch?: string;
      dirty: boolean;
    };
  };
  protectedPaths: string[];
  mechanicModel: {
    agentId: string;
    policy: string;
    usable: boolean;
    selected?: {
      provider: string;
      id: string;
    };
    problems: string[];
  };
  gateway: ReturnType<typeof readGatewayServiceStatus>;
  migrationHandoff: string;
  problems: string[];
}

export const cmdUpdate: CommandHandler = async (argv, config) => {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: "usage: shrimpy update [--dry-run] [--json]",
  });

  const preflight = await buildUpdatePreflight(config, values["dry-run"]);
  const applyUnsupportedMessage = "update apply is not implemented yet; no source, model, workspace, or gateway files were changed. Run `shrimpy update --dry-run` for the safe preflight.";

  if (!values["dry-run"]) {
    preflight.problems = [...new Set([
      ...preflight.problems,
      applyUnsupportedMessage,
    ])];
  }

  if (values.json) {
    console.log(JSON.stringify(preflight, null, 2));
    return preflight.problems.length === 0 ? 0 : 1;
  }

  printUpdatePreflight(preflight);

  if (values["dry-run"]) {
    return preflight.problems.length === 0 ? 0 : 1;
  }

  return printError(
    applyUnsupportedMessage,
  );
};

async function buildUpdatePreflight(
  config: ShrimpyConfig,
  dryRun: boolean,
): Promise<UpdatePreflight> {
  const paths = createWorkspacePaths(config.workspace);
  const metadata = readAppMetadata();
  const git = readGitState(projectRoot);
  const mechanicModel = await resolveMechanicModel(config);
  const gateway = readGatewayServiceStatus({ workspace: config.workspace });
  const binaryTarget = resolveBinaryTarget();
  const protectedPaths = [
    paths.primaryConfigPath,
    paths.authPath,
    paths.modelsPath,
  ];
  const problems = [
    ...mechanicModel.problems,
    ...(git?.dirty ? [`install checkout has local changes: ${projectRoot}`] : []),
  ];
  const versionLabel = git?.commit
    ? `${metadata.version}@${git.commit}`
    : metadata.version;

  return {
    dryRun,
    workspace: config.workspace,
    install: {
      appRoot: projectRoot,
      ...(binaryTarget ? { binaryTarget } : {}),
      version: metadata.version,
      ...(metadata.releaseName ? { releaseName: metadata.releaseName } : {}),
      ...(git ? { git } : {}),
    },
    protectedPaths,
    mechanicModel,
    gateway,
    migrationHandoff: `shrimpy chat mechanic --skill shrimpy-workspace-migration`,
    problems: [...new Set(problems)],
  };
}

async function resolveMechanicModel(
  config: ShrimpyConfig,
): Promise<UpdatePreflight["mechanicModel"]> {
  const runtime = createAppRuntime(config);
  const mechanic = runtime.getAgent("mechanic");
  const bootstrap = await runtime.createBootstrap({ agentId: mechanic.id });
  const policy = mechanic.modelPolicy ?? DEFAULT_MODEL_POLICY;
  const resolution = resolveSessionModel({
    bootstrap,
    defaultModelPolicy: mechanic.modelPolicy,
    missingMessage: `mechanic model policy is not usable: ${policy}`,
  });

  return {
    agentId: mechanic.id,
    policy,
    usable: Boolean(resolution.modelRef),
    ...(resolution.modelRef ? { selected: resolution.modelRef } : {}),
    problems: resolution.modelRef ? [] : resolution.problems,
  };
}

function readGitState(appRoot: string): UpdatePreflight["install"]["git"] {
  try {
    const inside = git(appRoot, "rev-parse", "--is-inside-work-tree");
    if (inside !== "true") return undefined;
    const commit = git(appRoot, "rev-parse", "--short", "HEAD");
    const branch = git(appRoot, "branch", "--show-current") || undefined;
    const status = git(appRoot, "status", "--porcelain", "--untracked-files=all");
    return {
      ...(commit ? { commit } : {}),
      ...(branch ? { branch } : {}),
      dirty: status.length > 0,
    };
  } catch {
    return undefined;
  }
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function resolveBinaryTarget(): string | undefined {
  const script = process.argv[1];
  if (!script || !existsSync(script)) return undefined;
  try {
    return realpathSync(script);
  } catch {
    return script;
  }
}

function printUpdatePreflight(preflight: UpdatePreflight): void {
  console.log("Shrimpy Update Preflight");
  console.log("");
  console.log(`workspace: ${preflight.workspace}`);
  console.log(`app_root: ${preflight.install.appRoot}`);
  if (preflight.install.binaryTarget) {
    console.log(`binary_target: ${preflight.install.binaryTarget}`);
  }
  const git = preflight.install.git;
  if (git) {
    console.log(`git: ${git.branch ?? "(detached)"} ${git.commit ?? "(unknown)"} ${git.dirty ? "dirty" : "clean"}`);
  }
  console.log(`mechanic_model: ${preflight.mechanicModel.usable ? "usable" : "unusable"} (${preflight.mechanicModel.policy})`);
  if (preflight.mechanicModel.selected) {
    console.log(`mechanic_model_selected: ${preflight.mechanicModel.selected.provider}/${preflight.mechanicModel.selected.id}`);
  }
  console.log(`gateway: ${preflight.gateway.active} (${preflight.gateway.manager}, ${preflight.gateway.enabled})`);
  console.log("protected_paths:");
  for (const path of preflight.protectedPaths) console.log(`  ${path}`);
  console.log(`migration_handoff: ${preflight.migrationHandoff}`);
  if (preflight.problems.length > 0) {
    console.log("problems:");
    for (const problem of preflight.problems) console.log(`  ${problem}`);
  }
}
