import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

export const WORKSPACE_CHECKPOINT_GITIGNORE = `# Managed by shrimpy workspace tracking.
*
!.gitignore
!context/
!context/**
!config/
!config/shrimpy.json
!config/channels.json
!agents/
!agents/*/
!agents/*/SOUL.md
!agents/*/watches.json
!agents/*/skills/
!agents/*/skills/**
!skills/
!skills/**
`;

export interface WorkspaceCheckpointStatus {
  workspace: string;
  enabled: boolean;
  clean: boolean | null;
  changedPaths: string[];
  diagnostics: string[];
  branch?: string;
  head?: string;
}

export interface WorkspaceCheckpointResult {
  created: boolean;
  changedPaths: string[];
  commit?: string;
  message: string;
}

interface WorkspaceCheckpointInitResult {
  repositoryCreated: boolean;
  gitignoreWritten: boolean;
  checkpoint: WorkspaceCheckpointResult;
  status: WorkspaceCheckpointStatus;
}

const COMMIT_GIT_CONFIG = [
  "-c",
  "user.name=Shrimpy",
  "-c",
  "user.email=shrimpy@localhost",
  "-c",
  "commit.gpgSign=false",
];

function gitDirPath(workspace: string): string {
  return join(workspace, ".git");
}

function gitignorePath(workspace: string): string {
  return join(workspace, ".gitignore");
}

function runGit(workspace: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: workspace,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function tryGit(workspace: string, args: string[]): string | null {
  try {
    return runGit(workspace, args);
  } catch {
    return null;
  }
}

function workspaceHasOwnGitRepo(workspace: string): boolean {
  return existsSync(gitDirPath(workspace));
}

function gitRoot(workspace: string): string | null {
  return tryGit(workspace, ["rev-parse", "--show-toplevel"]);
}

function rootMatchesWorkspace(workspace: string): boolean {
  const root = gitRoot(workspace);
  return root !== null && normalizePath(root) === normalizePath(workspace);
}

function normalizePath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function gitignoreMatches(workspace: string): boolean {
  const path = gitignorePath(workspace);
  return existsSync(path) && readFileSync(path, "utf-8") === WORKSPACE_CHECKPOINT_GITIGNORE;
}

function assertCheckpointRepo(workspace: string): void {
  if (!workspaceHasOwnGitRepo(workspace)) {
    throw new Error("workspace checkpoint tracking is not initialized");
  }
  if (!rootMatchesWorkspace(workspace)) {
    throw new Error("workspace .git exists but git root does not match the workspace path");
  }
  if (!gitignoreMatches(workspace)) {
    throw new Error("workspace checkpoint .gitignore is missing or differs from the Shrimpy whitelist");
  }
}

function parsePorcelainPaths(output: string): string[] {
  if (!output) return [];
  return output.split("\n").map((line) => line.slice(2).trim()).filter(Boolean);
}

export function inspectWorkspaceCheckpointStatus(workspace: string): WorkspaceCheckpointStatus {
  if (!workspaceHasOwnGitRepo(workspace)) {
    return {
      workspace,
      enabled: false,
      clean: null,
      changedPaths: [],
      diagnostics: [],
    };
  }

  const diagnostics: string[] = [];
  if (!rootMatchesWorkspace(workspace)) {
    diagnostics.push("workspace .git exists but git root does not match the workspace path");
  }
  if (!gitignoreMatches(workspace)) {
    diagnostics.push("workspace checkpoint .gitignore is missing or differs from the Shrimpy whitelist");
  }

  const statusOutput = diagnostics.length === 0
    ? tryGit(workspace, ["status", "--porcelain", "--untracked-files=all", "--", "."])
    : "";
  if (statusOutput === null) {
    diagnostics.push("git status failed");
  }
  const changedPaths = parsePorcelainPaths(statusOutput ?? "");

  return {
    workspace,
    enabled: true,
    clean: diagnostics.length === 0 ? changedPaths.length === 0 : null,
    changedPaths,
    diagnostics,
    branch: tryGit(workspace, ["branch", "--show-current"]) || undefined,
    head: tryGit(workspace, ["rev-parse", "--short", "HEAD"]) || undefined,
  };
}

export function initializeWorkspaceCheckpointTracking(workspace: string): WorkspaceCheckpointInitResult {
  mkdirSync(workspace, { recursive: true });

  const ignorePath = gitignorePath(workspace);
  const hasRepository = workspaceHasOwnGitRepo(workspace);
  if (hasRepository && !gitignoreMatches(workspace)) {
    throw new Error("workspace already has a git repo without the Shrimpy checkpoint whitelist");
  }
  if (!hasRepository && existsSync(ignorePath) && !gitignoreMatches(workspace)) {
    throw new Error(`refusing to overwrite existing .gitignore at ${ignorePath}`);
  }

  const repositoryCreated = !hasRepository;
  if (repositoryCreated) {
    runGit(workspace, ["init"]);
  }

  if (!rootMatchesWorkspace(workspace)) {
    throw new Error("git repository root does not match the workspace path");
  }

  const gitignoreWritten = !existsSync(ignorePath);
  if (gitignoreWritten) {
    writeFileSync(ignorePath, WORKSPACE_CHECKPOINT_GITIGNORE, "utf-8");
  }

  const checkpoint = createWorkspaceCheckpoint(workspace, {
    message: "checkpoint: initialize workspace tracking",
  });

  return {
    repositoryCreated,
    gitignoreWritten,
    checkpoint,
    status: inspectWorkspaceCheckpointStatus(workspace),
  };
}

export function createWorkspaceCheckpoint(workspace: string, opts: {
  message: string;
}): WorkspaceCheckpointResult {
  assertCheckpointRepo(workspace);

  const before = inspectWorkspaceCheckpointStatus(workspace);
  if (before.diagnostics.length > 0) {
    throw new Error(before.diagnostics.join("; "));
  }
  if (before.changedPaths.length === 0) {
    return {
      created: false,
      changedPaths: [],
      message: opts.message,
    };
  }

  runGit(workspace, ["add", "-A", "--", "."]);
  const staged = parsePorcelainPaths(
    runGit(workspace, ["status", "--porcelain", "--untracked-files=all", "--", "."]),
  );
  if (staged.length === 0) {
    return {
      created: false,
      changedPaths: [],
      message: opts.message,
    };
  }

  runGit(workspace, [...COMMIT_GIT_CONFIG, "commit", "-m", opts.message]);
  return {
    created: true,
    changedPaths: staged,
    commit: runGit(workspace, ["rev-parse", "--short", "HEAD"]),
    message: opts.message,
  };
}
