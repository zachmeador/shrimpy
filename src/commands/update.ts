import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { createAppRuntime } from "../app/runtime.js";
import {
  readShrimpyInstallMetadata,
  type ShrimpyInstallMetadata,
} from "../app/install-metadata.js";
import { parsePackageMetadata } from "../app/metadata.js";
import { projectRoot } from "../app/project-root.js";
import type { ShrimpyConfig } from "../config/load.js";
import type { PromptResourceRef } from "../context/resources.js";
import { findRunningGatewayPid } from "../gateway/pid-file.js";
import {
  readGatewayServiceStatus,
  type GatewayServiceStatus,
} from "../gateway/service/index.js";
import { getIncludedSkillDefinition } from "../skills/included.js";
import { SKILL_ENTRYPOINT } from "../skills/shared.js";
import { checkInteractiveAgentSession } from "../tui/interactive.js";
import {
  applyTaggedRelease,
  type TaggedReleaseApplyResult,
} from "../update/apply.js";
import {
  newestTaggedRelease,
  resolveExactTaggedRelease,
  resolveTaggedReleases,
  type TaggedRelease,
} from "../update/releases.js";
import { createWorkspacePaths } from "../workspace/paths.js";
import { renderCommandUsage } from "./catalog.js";
import {
  parseCommandArgs,
  printError,
  type CommandHandler,
  type CommandResult,
} from "./framework.js";
import { createShrimpyTuiCommand } from "./tui.js";

const UPDATE_USAGE = renderCommandUsage(["update"]);
const APPLY_USAGE = renderCommandUsage(["update", "apply"]);
const CHECK_USAGE = renderCommandUsage(["update", "check-mechanic"]);
const MIGRATION_SKILL = "shrimpy-workspace-migration";
const MIGRATION_SKILL_RESOURCE = resolveMigrationSkillResource();

export interface UpdatePreflight {
  dryRun: boolean;
  workspace: string;
  install: {
    appRoot: string;
    binaryTarget?: string;
    managed: boolean;
    origin?: string;
    currentVersion: string;
    currentCommit?: string;
    currentRef?: string;
    dirty: boolean;
  };
  target?: TaggedRelease;
  updateAvailable: boolean;
  mechanic: {
    usable: boolean;
    problems: string[];
  };
  gateway: {
    processPid?: number;
    service: GatewayServiceStatus;
  };
  applyCommand?: string;
  problems: string[];
}

interface UpdateCommandDeps {
  appRoot?: string;
  binaryTarget?: string;
  readInstallMetadata?: (
    appRoot: string,
  ) => ShrimpyInstallMetadata | undefined;
  resolveReleases?: (origin: string) => TaggedRelease[];
  checkMechanic?: (config: ShrimpyConfig) => Promise<void>;
  readGatewayStatus?: (config: ShrimpyConfig) => GatewayServiceStatus;
  findGatewayPid?: (config: ShrimpyConfig) => number | null;
  readGitState?: (appRoot: string) => {
    commit?: string;
    ref?: string;
    dirty: boolean;
  };
  applyRelease?: (
    input: {
      appRoot: string;
      workspace: string;
      release: TaggedRelease;
      expectedCommit: string;
      metadata: ShrimpyInstallMetadata;
    },
  ) => TaggedReleaseApplyResult;
}

export const cmdUpdate: CommandHandler = async (
  argv,
  config,
): Promise<CommandResult> => cmdUpdateWithDeps(argv, config);

export async function cmdUpdateWithDeps(
  argv: string[],
  config: ShrimpyConfig,
  deps: UpdateCommandDeps = {},
): Promise<CommandResult> {
  if (argv[0] === "apply") {
    return runApply(argv.slice(1), config, deps);
  }
  if (argv[0] === "check-mechanic") {
    return runMechanicCheck(argv.slice(1), config, deps);
  }

  const { values } = parseCommandArgs({
    args: argv,
    options: {
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: UPDATE_USAGE,
  });
  const preflight = await buildUpdatePreflight(config, values["dry-run"], deps);

  if (values.json) {
    console.log(JSON.stringify(preflight, null, 2));
    return preflight.problems.length === 0 ? 0 : 1;
  }
  if (values["dry-run"]) {
    printUpdatePreflight(preflight);
    return preflight.problems.length === 0 ? 0 : 1;
  }
  if (preflight.problems.length > 0) {
    printUpdatePreflight(preflight);
    return 1;
  }
  if (!preflight.target || !preflight.applyCommand) {
    console.log(`Shrimpy ${preflight.install.currentVersion} is already the newest tagged release.`);
    return 0;
  }

  return createShrimpyTuiCommand({
    agentId: "mechanic",
    session: { namespace: "local", name: "main" },
    purpose: "interactive",
    basePromptResources: [MIGRATION_SKILL_RESOURCE],
    cwd: config.workspace,
    initialMessage: renderMechanicUpdateTask(preflight),
  });
}

export async function buildUpdatePreflight(
  config: ShrimpyConfig,
  dryRun: boolean,
  deps: UpdateCommandDeps = {},
): Promise<UpdatePreflight> {
  const appRoot = deps.appRoot ?? projectRoot;
  const currentMetadata = parsePackageMetadata(
    readFileSync(join(appRoot, "package.json"), "utf-8"),
  );
  const readMetadata = deps.readInstallMetadata ?? readShrimpyInstallMetadata;
  let installMetadata: ShrimpyInstallMetadata | undefined;
  const problems: string[] = [];
  try {
    installMetadata = readMetadata(appRoot);
  } catch (error) {
    problems.push(errorText(error));
  }
  const gitState = (deps.readGitState ?? readGitState)(appRoot);
  if (!installMetadata) {
    problems.push(unmanagedCheckoutMessage(appRoot, gitState));
  } else {
    if (gitState.dirty) {
      problems.push(`Shrimpy install checkout has local changes: ${appRoot}`);
    }
    if (
      gitState.commit &&
      gitState.commit !== installMetadata.installedCommit
    ) {
      problems.push(
        `Shrimpy install commit ${gitState.commit} does not match managed metadata ${installMetadata.installedCommit}`,
      );
    }
  }

  let target: TaggedRelease | undefined;
  if (installMetadata) {
    try {
      const releases = (deps.resolveReleases ?? resolveTaggedReleases)(
        installMetadata.origin,
      );
      target = newestTaggedRelease(releases, currentMetadata.version);
    } catch (error) {
      problems.push(`Unable to resolve tagged releases: ${errorText(error)}`);
    }
  }

  const mechanic = await inspectMechanic(config, deps);
  problems.push(...mechanic.problems);
  const findPid = deps.findGatewayPid ?? defaultFindGatewayPid;
  const processPid = findPid(config) ?? undefined;
  const service = (deps.readGatewayStatus ?? defaultGatewayStatus)(config);

  const applyCommand = target
    ? `shrimpy update apply --tag ${target.tag} --commit ${target.commit}`
    : undefined;
  return {
    dryRun,
    workspace: config.workspace,
    install: {
      appRoot,
      ...(deps.binaryTarget ?? resolveBinaryTarget()
        ? { binaryTarget: deps.binaryTarget ?? resolveBinaryTarget() }
        : {}),
      managed: Boolean(installMetadata),
      ...(installMetadata ? { origin: installMetadata.origin } : {}),
      currentVersion: currentMetadata.version,
      ...(gitState.commit ? { currentCommit: gitState.commit } : {}),
      ...(installMetadata?.installedRef ?? gitState.ref
        ? { currentRef: installMetadata?.installedRef ?? gitState.ref }
        : {}),
      dirty: gitState.dirty,
    },
    ...(target ? { target } : {}),
    updateAvailable: Boolean(target),
    mechanic,
    gateway: {
      ...(processPid ? { processPid } : {}),
      service,
    },
    ...(applyCommand ? { applyCommand } : {}),
    problems: [...new Set(problems)],
  };
}

export async function checkMechanicTuiBootstrap(
  config: ShrimpyConfig,
): Promise<void> {
  const runtime = createAppRuntime(config);
  await checkInteractiveAgentSession({
    runtime,
    agentId: "mechanic",
    session: { namespace: "local", name: "update-check" },
    purpose: "update-check",
    persistent: false,
    basePromptResources: [MIGRATION_SKILL_RESOURCE],
    cwd: config.workspace,
  });
}

async function runApply(
  argv: string[],
  config: ShrimpyConfig,
  deps: UpdateCommandDeps,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      tag: { type: "string" },
      commit: { type: "string" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: APPLY_USAGE,
  });
  const tag = values.tag;
  const expectedCommit = values.commit;
  if (!tag || !expectedCommit) {
    return printError(`${APPLY_USAGE}\nBoth --tag and --commit are required.`);
  }

  try {
    const appRoot = deps.appRoot ?? projectRoot;
    const metadata = (deps.readInstallMetadata ?? readShrimpyInstallMetadata)(
      appRoot,
    );
    const gitState = (deps.readGitState ?? readGitState)(appRoot);
    if (!metadata) throw new Error(unmanagedCheckoutMessage(appRoot, gitState));
    if (gitState.dirty) {
      throw new Error(`Shrimpy install checkout has local changes: ${appRoot}`);
    }
    if (gitState.commit && gitState.commit !== metadata.installedCommit) {
      throw new Error("managed Shrimpy install changed after update planning");
    }
    await runMechanicCheckQuietly(config, deps);
    const runningPid = (deps.findGatewayPid ?? defaultFindGatewayPid)(config);
    if (runningPid !== null) {
      throw new Error(
        `gateway still owns this workspace (PID ${runningPid}); run shrimpy gateway stop before applying the release`,
      );
    }
    const releases = (deps.resolveReleases ?? resolveTaggedReleases)(
      metadata.origin,
    );
    const release = resolveExactTaggedRelease(releases, tag);
    if (release.commit !== expectedCommit) {
      throw new Error(
        `release tag ${tag} changed: expected ${expectedCommit}, found ${release.commit}`,
      );
    }
    const result = (deps.applyRelease ?? ((input) =>
      applyTaggedRelease(input)))({
      appRoot,
      workspace: config.workspace,
      release,
      expectedCommit,
      metadata,
    });
    if (values.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Installed Shrimpy ${result.tag} (${result.commit.slice(0, 12)}).`);
      console.log("Mechanic TUI bootstrap: passed");
    }
    return 0;
  } catch (error) {
    const message = errorText(error);
    if (values.json) {
      console.log(JSON.stringify({ ok: false, error: message }, null, 2));
      return 1;
    }
    return printError(message);
  }
}

async function runMechanicCheck(
  argv: string[],
  config: ShrimpyConfig,
  deps: UpdateCommandDeps,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage: CHECK_USAGE,
  });
  try {
    await runMechanicCheckQuietly(config, deps);
    if (values.json) {
      console.log(JSON.stringify({ usable: true, agentId: "mechanic" }, null, 2));
    } else {
      console.log("Mechanic TUI bootstrap: passed");
    }
    return 0;
  } catch (error) {
    const message = errorText(error);
    if (values.json) {
      console.log(JSON.stringify({
        usable: false,
        agentId: "mechanic",
        problems: [message],
      }, null, 2));
      return 1;
    }
    return printError(`Mechanic TUI bootstrap failed: ${message}`);
  }
}

async function inspectMechanic(
  config: ShrimpyConfig,
  deps: UpdateCommandDeps,
): Promise<UpdatePreflight["mechanic"]> {
  try {
    await runMechanicCheckQuietly(config, deps);
    return { usable: true, problems: [] };
  } catch (error) {
    return {
      usable: false,
      problems: [`Mechanic TUI bootstrap failed: ${errorText(error)}`],
    };
  }
}

async function runMechanicCheckQuietly(
  config: ShrimpyConfig,
  deps: UpdateCommandDeps,
): Promise<void> {
  const originalWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  try {
    await (deps.checkMechanic ?? checkMechanicTuiBootstrap)(config);
  } finally {
    process.stdout.write = originalWrite;
  }
}

function renderMechanicUpdateTask(preflight: UpdatePreflight): string {
  const target = preflight.target!;
  return [
    `Update Shrimpy from ${preflight.install.currentRef ?? preflight.install.currentVersion} (${preflight.install.currentCommit ?? "unknown commit"}) to ${target.tag} (${target.commit}).`,
    "",
    `Origin: ${preflight.install.origin}`,
    `Managed app: ${preflight.install.appRoot}`,
    `Workspace: ${preflight.workspace}`,
    `Gateway before update: ${preflight.gateway.processPid ? `running as PID ${preflight.gateway.processPid}` : "not running"}; service ${preflight.gateway.service.active} (${preflight.gateway.service.manager}, ${preflight.gateway.service.enabled})`,
    `Guarded apply command: ${preflight.applyCommand}`,
    "",
    `Do this skill: ${join(MIGRATION_SKILL_RESOURCE.rootPath, MIGRATION_SKILL_RESOURCE.resourcePath)}`,
  ].join("\n");
}

function printUpdatePreflight(preflight: UpdatePreflight): void {
  console.log("Shrimpy Update");
  console.log("");
  console.log(`workspace: ${preflight.workspace}`);
  console.log(`app_root: ${preflight.install.appRoot}`);
  console.log(`managed: ${preflight.install.managed ? "yes" : "no"}`);
  console.log(`current: ${preflight.install.currentRef ?? `v${preflight.install.currentVersion}`} (${preflight.install.currentCommit ?? "unknown"})`);
  console.log(`target: ${preflight.target ? `${preflight.target.tag} (${preflight.target.commit})` : "none"}`);
  console.log(`mechanic_tui: ${preflight.mechanic.usable ? "usable" : "unusable"}`);
  console.log(`gateway: ${preflight.gateway.processPid ? `running (PID ${preflight.gateway.processPid})` : "not running"}; service ${preflight.gateway.service.active}`);
  if (preflight.applyCommand) console.log(`apply: ${preflight.applyCommand}`);
  if (preflight.problems.length > 0) {
    console.log("problems:");
    for (const problem of preflight.problems) console.log(`  ${problem}`);
  }
}

function readGitState(appRoot: string): {
  commit?: string;
  ref?: string;
  dirty: boolean;
} {
  try {
    const commit = git(appRoot, "rev-parse", "HEAD") || undefined;
    const ref = git(appRoot, "describe", "--tags", "--exact-match", "HEAD") ||
      git(appRoot, "branch", "--show-current") ||
      undefined;
    const status = git(
      appRoot,
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ".",
      ":(exclude)package-lock.json",
    );
    return { commit, ref, dirty: status.length > 0 };
  } catch {
    return { dirty: true };
  }
}

function git(cwd: string, ...args: string[]): string {
  try {
    return String(execFileSync("git", ["-C", cwd, ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    })).trim();
  } catch {
    return "";
  }
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

function unmanagedCheckoutMessage(
  appRoot: string,
  gitState: { commit?: string },
): string {
  if (gitState.commit) {
    return `This is a source-development checkout: ${appRoot}. shrimpy update manages tagged release installs only; use Git and the repository build workflow here.`;
  }
  return `Shrimpy checkout is not installer-managed: ${appRoot}. Install Shrimpy with scripts/install.sh before using shrimpy update.`;
}

function resolveMigrationSkillResource(): PromptResourceRef {
  const definition = getIncludedSkillDefinition(MIGRATION_SKILL);
  if (!definition) {
    throw new Error(`included update skill is missing: ${MIGRATION_SKILL}`);
  }
  return {
    rootPath: definition.rootPath,
    resourcePath: SKILL_ENTRYPOINT,
  };
}

function defaultFindGatewayPid(config: ShrimpyConfig): number | null {
  return findRunningGatewayPid(
    createWorkspacePaths(config.workspace).gatewayPidPath,
  );
}

function defaultGatewayStatus(config: ShrimpyConfig): GatewayServiceStatus {
  return readGatewayServiceStatus({ workspace: config.workspace });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
