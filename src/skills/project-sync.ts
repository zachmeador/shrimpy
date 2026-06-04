import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectRoot } from "../app/project-root.js";

const SKILL_ENTRYPOINT = "SKILL.md";

export const CLAUDE_INSTRUCTIONS_ORIGIN_NOTE =
  "Generated from AGENTS.md by Shrimpy's build.";
export const PROJECT_SKILL_MANAGED_MARKER = "DIRECTORY_MANAGED_BY_SHRIMPY_BUILD";

export interface ClaudeInstructionSyncOptions {
  sourcePath?: string;
  targetPath?: string;
}

export interface ClaudeInstructionSyncResult {
  sourcePath: string;
  targetPath: string;
}

export interface ProjectSkillSourceBundle {
  id: string;
  rootPath: string;
  entryPath: string;
}

export interface ProjectSkillSyncTarget {
  name: string;
  rootPath: string;
}

export interface ProjectSkillSyncOptions {
  sourceDir?: string;
  targets?: ProjectSkillSyncTarget[];
}

export interface ProjectSkillSyncTargetResult {
  name: string;
  rootPath: string;
  markerPath: string;
  skills: string[];
}

export interface ProjectSkillSyncResult {
  sourceDir: string;
  skills: string[];
  targets: ProjectSkillSyncTargetResult[];
}

export interface ProjectBuildArtifactSyncOptions extends ProjectSkillSyncOptions {
  claudeInstructions?: ClaudeInstructionSyncOptions | false;
}

export interface ProjectBuildArtifactSyncResult {
  skills: ProjectSkillSyncResult;
  claudeInstructions?: ClaudeInstructionSyncResult;
}

export function defaultClaudeInstructionSourcePath(): string {
  return join(projectRoot, "AGENTS.md");
}

export function defaultClaudeInstructionTargetPath(): string {
  return join(projectRoot, "CLAUDE.md");
}

export function defaultProjectSkillSourceDir(): string {
  return join(projectRoot, "src", "skills");
}

export function defaultProjectSkillSyncTargets(): ProjectSkillSyncTarget[] {
  return [
    { name: "claude", rootPath: join(projectRoot, ".claude", "skills") },
    { name: "agents", rootPath: join(projectRoot, ".agents", "skills") },
  ];
}

export function syncClaudeInstructions(
  opts: ClaudeInstructionSyncOptions = {},
): ClaudeInstructionSyncResult {
  const sourcePath = resolve(opts.sourcePath ?? defaultClaudeInstructionSourcePath());
  const targetPath = resolve(opts.targetPath ?? defaultClaudeInstructionTargetPath());
  const source = readFileSync(sourcePath, "utf-8").trimEnd();
  writeFileSync(
    targetPath,
    [CLAUDE_INSTRUCTIONS_ORIGIN_NOTE, "", source, ""].join("\n"),
    "utf-8",
  );
  return { sourcePath, targetPath };
}

export function listProjectSkillSourceBundles(
  sourceDir = defaultProjectSkillSourceDir(),
): ProjectSkillSourceBundle[] {
  const resolvedSourceDir = resolve(sourceDir);
  if (!existsSync(resolvedSourceDir)) {
    throw new Error(`project skills source directory does not exist: ${resolvedSourceDir}`);
  }
  if (!statSync(resolvedSourceDir).isDirectory()) {
    throw new Error(`project skills source path is not a directory: ${resolvedSourceDir}`);
  }

  return readdirSync(resolvedSourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const rootPath = join(resolvedSourceDir, entry.name);
      return {
        id: entry.name,
        rootPath,
        entryPath: join(rootPath, SKILL_ENTRYPOINT),
      };
    })
    .filter((bundle) => existsSync(bundle.entryPath))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function syncProjectSkills(
  opts: ProjectSkillSyncOptions = {},
): ProjectSkillSyncResult {
  const sourceDir = resolve(opts.sourceDir ?? defaultProjectSkillSourceDir());
  const targets = opts.targets ?? defaultProjectSkillSyncTargets();
  const bundles = listProjectSkillSourceBundles(sourceDir);
  const skills = bundles.map((bundle) => bundle.id);
  const targetResults: ProjectSkillSyncTargetResult[] = [];

  for (const target of targets) {
    const rootPath = resolve(target.rootPath);
    const markerPath = prepareManagedTarget(rootPath);
    for (const bundle of bundles) {
      cpSync(bundle.rootPath, join(rootPath, bundle.id), {
        recursive: true,
        force: false,
      });
    }
    targetResults.push({
      name: target.name,
      rootPath,
      markerPath,
      skills,
    });
  }

  return {
    sourceDir,
    skills,
    targets: targetResults,
  };
}

export function syncProjectBuildArtifacts(
  opts: ProjectBuildArtifactSyncOptions = {},
): ProjectBuildArtifactSyncResult {
  const skills = syncProjectSkills(opts);
  const claudeInstructions = opts.claudeInstructions === false
    ? undefined
    : syncClaudeInstructions(opts.claudeInstructions);
  return {
    skills,
    claudeInstructions,
  };
}

function prepareManagedTarget(rootPath: string): string {
  const markerPath = join(rootPath, PROJECT_SKILL_MANAGED_MARKER);
  if (existsSync(rootPath)) {
    if (!statSync(rootPath).isDirectory()) {
      throw new Error(`project skill target is not a directory: ${rootPath}`);
    }
    if (!existsSync(markerPath)) {
      throw new Error(
        `refusing to replace unmanaged project skill target: ${rootPath}`,
      );
    }
    for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
      if (entry.name === PROJECT_SKILL_MANAGED_MARKER) continue;
      rmSync(join(rootPath, entry.name), { recursive: true, force: true });
    }
  } else {
    mkdirSync(rootPath, { recursive: true });
  }
  writeFileSync(markerPath, markerText(), "utf-8");
  return markerPath;
}

function markerText(): string {
  return [
    "This directory is managed by Shrimpy's build.",
    "Edit repository skills under src/skills/ instead.",
    "",
  ].join("\n");
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  try {
    const result = syncProjectBuildArtifacts();
    console.log(
      `Synced ${result.skills.skills.length} project skills from ${result.skills.sourceDir}`,
    );
    for (const target of result.skills.targets) {
      console.log(`${target.rootPath}: ${target.skills.join(", ")}`);
    }
    if (result.claudeInstructions) {
      console.log(
        `Synced ${result.claudeInstructions.targetPath} from ${result.claudeInstructions.sourcePath}`,
      );
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
