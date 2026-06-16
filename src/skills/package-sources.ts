import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import type {
  GitHubSkillPackageInfo,
  SkillPackageCandidate,
  SkillPackageInfo,
  SkillPackageSourceKind,
  SkillPackageSourceRevisionKind,
} from "./package-state.js";
import {
  getIncludedSkillDefinition,
  type IncludedSkillAssignment,
} from "./included.js";
import {
  deriveSkillIdFromGitHubPath,
  deriveSkillIdFromSource,
  deriveSkillIdFromUrl,
  normalizeSkillId,
  readSkillDescriptionFromContent,
  readSkillNameFromContent,
  SKILL_ENTRYPOINT,
  uniqueStrings,
} from "./shared.js";

export type PreparedPackageSource =
  | PreparedIncludedPackageSource
  | PreparedLocalDirectoryPackageSource
  | PreparedContentPackageSource
  | PreparedGitHubPackageSource;

interface PreparedPackageBase {
  kind: SkillPackageSourceKind;
  source: string;
  skillName: string;
  description: string;
  sourceRevision?: string;
  sourceRevisionKind?: SkillPackageSourceRevisionKind;
}

interface PreparedLocalDirectoryPackageSource extends PreparedPackageBase {
  kind: "local-directory";
  path: string;
  entryPath: string;
}

export interface PreparedIncludedPackageSource extends PreparedPackageBase {
  kind: "included";
  path: string;
  entryPath: string;
  assignment?: IncludedSkillAssignment;
}

interface PreparedContentPackageSource extends PreparedPackageBase {
  kind: "local-file" | "url";
  content: string;
  path: string;
  entryPath: string;
}

interface PreparedGitHubPackageSource extends PreparedPackageBase {
  kind: "github";
  path: string;
  entryPath: string;
  github: GitHubSkillPackageInfo;
  githubCandidate: GitHubSkillCandidate;
}

interface GitHubSourceSpec {
  owner: string;
  repo: string;
  ref?: string;
  path?: string;
}

interface GitHubSkillCandidate {
  owner: string;
  repo: string;
  ref: string;
  resolvedRef: string;
  resolvedSha: string;
  rootPath: string;
  entryPath: string;
  entrySha: string;
  sourceRevision: string;
  sourceRevisionKind: Extract<SkillPackageSourceRevisionKind, "tree" | "blob">;
  htmlUrl: string;
  tree: GitHubTreeEntry[];
}

interface GitHubTreeEntry {
  path: string;
  mode?: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
  url?: string;
}

interface GitHubTreeResponse {
  sha: string;
  tree: GitHubTreeEntry[];
  truncated?: boolean;
}

export async function preparePackageSources(
  source: string,
  opts: {
    ref?: string;
    path?: string;
  } = {},
): Promise<PreparedPackageSource[]> {
  const included = prepareIncludedPackageSource(source);
  if (included) return [included];

  const sourcePath = resolve(process.cwd(), source);
  if (!isHttpUrl(source) && existsSync(sourcePath)) {
    return [prepareLocalPackageSource(source, sourcePath)];
  }

  const githubSpec = parseGitHubSourceSpec(source, opts);
  if (githubSpec) {
    return prepareGitHubPackageSources(source, githubSpec);
  }

  if (isHttpUrl(source)) {
    const content = await fetchSkillUrl(source);
    return [{
      kind: "url",
      source,
      content,
      skillName: readSkillNameFromContent(content) ?? deriveSkillIdFromUrl(source),
      description: readSkillDescriptionFromContent(content),
      path: source,
      entryPath: source,
      sourceRevision: hashSinglePackageFile(content),
      sourceRevisionKind: "hash",
    }];
  }

  throw new Error(`skill source does not exist: ${sourcePath}`);
}

export async function preparePackageSourceForUpdate(
  info: SkillPackageInfo,
): Promise<PreparedPackageSource> {
  if (info.sourceKind === "github" && info.github) {
    const sources = await prepareGitHubPackageSources(info.source, {
      owner: info.github.owner,
      repo: info.github.repo,
      ref: info.github.ref,
      path: info.github.path,
    });
    const byPath = sources.find((source) => source.path === info.github!.path);
    if (byPath) return byPath;
    if (sources.length === 1) return sources[0]!;
    throw new Error(`GitHub skill package no longer exists at ${info.github.path}`);
  }

  const sources = await preparePackageSources(info.source);
  if (sources.length === 1) return sources[0]!;
  const byName = sources.find((source) => normalizeSkillId(source.skillName) === info.id);
  if (byName) return byName;
  throw new Error(`skill source resolves to multiple packages; cannot update ${info.id}`);
}

export async function writePreparedPackageSource(
  source: PreparedPackageSource,
  targetRoot: string,
): Promise<void> {
  switch (source.kind) {
    case "included":
    case "local-directory":
      copySkillDirectorySafe(source.path, targetRoot);
      return;
    case "local-file":
    case "url":
      writeFileSync(join(targetRoot, SKILL_ENTRYPOINT), source.content, "utf-8");
      return;
    case "github": {
      const files = await fetchGitHubPackageFiles(source.githubCandidate);
      for (const file of files) {
        const targetPath = join(targetRoot, ...file.path.split("/"));
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, file.content);
      }
      return;
    }
  }
}

export function toSkillPackageCandidate(
  source: PreparedPackageSource,
  idOverride?: string,
): SkillPackageCandidate {
  const id = normalizeSkillId(idOverride ?? source.skillName);
  return {
    id,
    name: source.skillName,
    description: source.description,
    source: source.source,
    sourceKind: source.kind,
    path: source.path,
    entryPath: source.entryPath,
    sourceRevision: source.sourceRevision,
    sourceRevisionKind: source.sourceRevisionKind,
    github: source.kind === "github" ? source.github : undefined,
  };
}

export function ensureUniqueSelectedSkillIds(
  sources: PreparedPackageSource[],
  idOverride?: string,
): void {
  const ids = sources.map((source) => normalizeSkillId(idOverride ?? source.skillName));
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`multiple selected skills resolve to the same id: ${uniqueStrings(duplicates).join(", ")}`);
  }
}

export function multipleSkillCandidatesMessage(
  source: string,
  candidates: SkillPackageCandidate[],
): string {
  const lines = [
    `multiple skills found in ${source}; choose one with --path or install all with --all:`,
    ...candidates.map((candidate) =>
      `- ${candidate.path || "."} (${candidate.name})${candidate.description ? ` - ${candidate.description}` : ""}`
    ),
  ];
  return lines.join("\n");
}

export async function hashPreparedPackageSource(
  source: PreparedPackageSource,
): Promise<string> {
  switch (source.kind) {
    case "included":
    case "local-directory":
      return hashSkillPackage(source.path);
    case "local-file":
    case "url":
      return hashSinglePackageFile(source.content);
    case "github":
      return hashPackageFiles(await fetchGitHubPackageFiles(source.githubCandidate));
  }
}

export function hashSkillPackage(rootPath: string): string {
  const hash = createHash("sha256");
  for (const filePath of walkPackageFiles(rootPath)) {
    hash.update(relative(rootPath, filePath).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

export function prepareIncludedPackageSource(
  source: string,
): PreparedIncludedPackageSource | undefined {
  const match = /^included:(.+)$/i.exec(source.trim());
  if (!match) return undefined;
  const definition = getIncludedSkillDefinition(match[1]!);
  if (!definition) {
    throw new Error(`included skill not found: ${match[1]}`);
  }
  if (!existsSync(definition.entryPath)) {
    throw new Error(`included skill is missing ${SKILL_ENTRYPOINT}: ${definition.rootPath}`);
  }
  const content = readFileSync(definition.entryPath, "utf-8");
  return {
    kind: "included",
    source: definition.source,
    path: definition.rootPath,
    entryPath: definition.entryPath,
    skillName: readSkillNameFromContent(content) ?? definition.id,
    description: readSkillDescriptionFromContent(content),
    sourceRevision: hashSkillPackage(definition.rootPath),
    sourceRevisionKind: "hash",
    assignment: definition.assignment,
  };
}

function prepareLocalPackageSource(
  source: string,
  sourcePath: string,
): PreparedPackageSource {
  const sourceStats = statSync(sourcePath);
  if (sourceStats.isDirectory()) {
    const entryPath = join(sourcePath, SKILL_ENTRYPOINT);
    if (!existsSync(entryPath)) {
      throw new Error(`skill directory is missing SKILL.md: ${sourcePath}`);
    }
    const content = readFileSync(entryPath, "utf-8");
    return {
      kind: "local-directory",
      source,
      path: sourcePath,
      entryPath,
      skillName: readSkillNameFromContent(content) ??
        deriveSkillIdFromSource(sourcePath),
      description: readSkillDescriptionFromContent(content),
      sourceRevision: hashSkillPackage(sourcePath),
      sourceRevisionKind: "hash",
    };
  }
  if (!sourceStats.isFile() || !sourcePath.endsWith(".md")) {
    throw new Error(`skill source must be a directory, Markdown file, or URL: ${sourcePath}`);
  }
  const content = readFileSync(sourcePath, "utf-8");
  return {
    kind: "local-file",
    source,
    content,
    path: sourcePath,
    entryPath: sourcePath,
    skillName: readSkillNameFromContent(content) ?? deriveSkillIdFromSource(sourcePath),
    description: readSkillDescriptionFromContent(content),
    sourceRevision: hashSinglePackageFile(content),
    sourceRevisionKind: "hash",
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function fetchSkillUrl(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`failed to fetch skill URL ${source}: ${response.status} ${response.statusText}`);
  }
  const content = await response.text();
  if (!content.trimStart().startsWith("---")) {
    throw new Error(`skill URL did not return a SKILL.md document: ${source}`);
  }
  return content;
}

function parseGitHubSourceSpec(
  source: string,
  opts: {
    ref?: string;
    path?: string;
  } = {},
): GitHubSourceSpec | undefined {
  let owner: string | undefined;
  let repo: string | undefined;
  let ref = opts.ref;
  let path = opts.path;

  if (isHttpUrl(source)) {
    const url = new URL(source);
    if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
      return undefined;
    }
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (segments.length < 2) return undefined;
    owner = segments[0];
    repo = normalizeGitHubRepoName(segments[1]!);
    if ((segments[2] === "tree" || segments[2] === "blob") && segments[3]) {
      ref ??= segments[3];
      const rest = segments.slice(4).join("/");
      if (rest && !path) path = segments[2] === "blob" && rest.endsWith(`/${SKILL_ENTRYPOINT}`)
        ? dirname(rest)
        : rest;
    }
  } else {
    const segments = source.split("/").filter(Boolean);
    if (segments.length < 2) return undefined;
    owner = segments[0];
    const repoMatch = /^([A-Za-z0-9_.-]+?)(?:@([^/]+))?$/.exec(segments[1]!);
    if (!repoMatch) return undefined;
    repo = normalizeGitHubRepoName(repoMatch[1]!);
    ref ??= repoMatch[2];
    const rest = segments.slice(2).join("/");
    if (rest && !path) path = rest.endsWith(`/${SKILL_ENTRYPOINT}`)
      ? dirname(rest)
      : rest;
  }

  if (!owner || !repo || !isGitHubOwnerOrRepo(owner) || !isGitHubOwnerOrRepo(repo)) {
    return undefined;
  }

  return {
    owner,
    repo,
    ref,
    path: normalizeGitHubPath(path),
  };
}

function normalizeGitHubRepoName(repo: string): string {
  return repo.endsWith(".git") ? repo.slice(0, -4) : repo;
}

function normalizeGitHubPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const normalized = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");
  if (normalized === SKILL_ENTRYPOINT) return "";
  if (normalized.endsWith(`/${SKILL_ENTRYPOINT}`)) {
    return dirname(normalized);
  }
  return normalized;
}

function isGitHubOwnerOrRepo(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

async function prepareGitHubPackageSources(
  originalSource: string,
  spec: GitHubSourceSpec,
): Promise<PreparedGitHubPackageSource[]> {
  const resolved = await resolveGitHubSource(spec);
  const tree = await fetchGitHubTree(resolved.owner, resolved.repo, resolved.resolvedSha);
  const entryPaths = selectGitHubSkillEntryPaths(tree.tree, resolved.path);
  if (entryPaths.length === 0) {
    const target = resolved.path ? `${resolved.path}/${SKILL_ENTRYPOINT}` : SKILL_ENTRYPOINT;
    throw new Error(`GitHub repository does not contain ${target}: ${resolved.owner}/${resolved.repo}`);
  }

  const sources: PreparedGitHubPackageSource[] = [];
  for (const entryPath of entryPaths) {
    const entry = tree.tree.find((candidate) =>
      candidate.type === "blob" &&
      candidate.path === entryPath &&
      candidate.mode !== "120000"
    );
    if (!entry) continue;
    const content = await fetchGitHubBlobText(resolved.owner, resolved.repo, entry.sha);
    const rootPath = dirname(entryPath) === "." ? "" : dirname(entryPath);
    const treeEntry = rootPath
      ? tree.tree.find((candidate) => candidate.type === "tree" && candidate.path === rootPath)
      : undefined;
    const sourceRevision = rootPath ? (treeEntry?.sha ?? entry.sha) : entry.sha;
    const sourceRevisionKind = rootPath ? "tree" : "blob";
    const github = githubPackageInfo({
      owner: resolved.owner,
      repo: resolved.repo,
      path: rootPath,
      ref: resolved.ref,
      resolvedRef: resolved.resolvedRef,
      resolvedSha: resolved.resolvedSha,
      sourceRevision,
      sourceRevisionKind,
    });
    sources.push({
      kind: "github",
      source: originalSource,
      path: rootPath,
      entryPath,
      skillName: readSkillNameFromContent(content) ?? deriveSkillIdFromGitHubPath(rootPath),
      description: readSkillDescriptionFromContent(content),
      sourceRevision,
      sourceRevisionKind,
      github,
      githubCandidate: {
        owner: resolved.owner,
        repo: resolved.repo,
        ref: resolved.ref,
        resolvedRef: resolved.resolvedRef,
        resolvedSha: resolved.resolvedSha,
        rootPath,
        entryPath,
        entrySha: entry.sha,
        sourceRevision,
        sourceRevisionKind,
        htmlUrl: github.htmlUrl,
        tree: tree.tree,
      },
    });
  }
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

async function resolveGitHubSource(spec: GitHubSourceSpec): Promise<{
  owner: string;
  repo: string;
  ref: string;
  resolvedRef: string;
  resolvedSha: string;
  path?: string;
}> {
  const ref = spec.ref ?? await fetchGitHubDefaultBranch(spec.owner, spec.repo);
  const commit = await githubFetchJson<{ sha?: unknown }>(
    `https://api.github.com/repos/${spec.owner}/${spec.repo}/commits/${encodeURIComponent(ref)}`,
  );
  if (typeof commit.sha !== "string") {
    throw new Error(`GitHub did not return a commit SHA for ${spec.owner}/${spec.repo}@${ref}`);
  }
  return {
    owner: spec.owner,
    repo: spec.repo,
    ref,
    resolvedRef: ref,
    resolvedSha: commit.sha,
    path: spec.path,
  };
}

async function fetchGitHubDefaultBranch(owner: string, repo: string): Promise<string> {
  const metadata = await githubFetchJson<{ default_branch?: unknown }>(
    `https://api.github.com/repos/${owner}/${repo}`,
  );
  if (typeof metadata.default_branch !== "string") {
    throw new Error(`GitHub did not return a default branch for ${owner}/${repo}`);
  }
  return metadata.default_branch;
}

async function fetchGitHubTree(
  owner: string,
  repo: string,
  sha: string,
): Promise<GitHubTreeResponse> {
  const tree = await githubFetchJson<GitHubTreeResponse>(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
  );
  if (!Array.isArray(tree.tree)) {
    throw new Error(`GitHub did not return a tree for ${owner}/${repo}@${sha}`);
  }
  if (tree.truncated) {
    throw new Error(`GitHub tree is truncated for ${owner}/${repo}@${sha}; use --path to select a skill directory`);
  }
  return tree;
}

async function fetchGitHubBlobText(
  owner: string,
  repo: string,
  sha: string,
): Promise<string> {
  return (await fetchGitHubBlobBytes(owner, repo, sha)).toString("utf-8");
}

async function fetchGitHubBlobBytes(
  owner: string,
  repo: string,
  sha: string,
): Promise<Buffer> {
  const blob = await githubFetchJson<{ content?: unknown; encoding?: unknown }>(
    `https://api.github.com/repos/${owner}/${repo}/git/blobs/${sha}`,
  );
  if (typeof blob.content !== "string" || blob.encoding !== "base64") {
    throw new Error(`GitHub did not return a base64 blob for ${owner}/${repo}@${sha}`);
  }
  return Buffer.from(blob.content.replace(/\s+/g, ""), "base64");
}

async function githubFetchJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "shrimpy",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub request failed ${response.status} ${response.statusText}: ${url}`);
  }
  return await response.json() as T;
}

function selectGitHubSkillEntryPaths(
  tree: GitHubTreeEntry[],
  path: string | undefined,
): string[] {
  if (path !== undefined) {
    const entryPath = path ? `${path}/${SKILL_ENTRYPOINT}` : SKILL_ENTRYPOINT;
    return tree.some((entry) =>
        entry.type === "blob" &&
        entry.mode !== "120000" &&
        entry.path === entryPath
      )
      ? [entryPath]
      : [];
  }
  return tree
    .filter((entry) =>
      entry.type === "blob" &&
      entry.mode !== "120000" &&
      basename(entry.path) === SKILL_ENTRYPOINT
    )
    .map((entry) => entry.path)
    .sort();
}

function githubPackageInfo(opts: {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  resolvedRef: string;
  resolvedSha: string;
  sourceRevision: string;
  sourceRevisionKind: Extract<SkillPackageSourceRevisionKind, "tree" | "blob">;
}): GitHubSkillPackageInfo {
  return {
    ...opts,
    htmlUrl: `https://github.com/${opts.owner}/${opts.repo}/tree/${opts.resolvedRef}${
      opts.path ? `/${opts.path}` : ""
    }`,
  };
}

export function copySkillDirectorySafe(sourceRoot: string, targetRoot: string): void {
  mkdirSync(targetRoot, { recursive: true });
  for (const entry of readdirSync(sourceRoot, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const sourcePath = join(sourceRoot, entry.name);
    const targetPath = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      copySkillDirectorySafe(sourcePath, targetPath);
    } else if (entry.isFile()) {
      mkdirSync(dirname(targetPath), { recursive: true });
      copyFileSync(sourcePath, targetPath);
    }
  }
}

async function fetchGitHubPackageFiles(
  candidate: GitHubSkillCandidate,
): Promise<Array<{ path: string; content: Buffer }>> {
  const entries = candidate.tree
    .filter((entry) =>
      entry.type === "blob" &&
      entry.mode !== "120000" &&
      isGitHubEntryInSkillRoot(entry.path, candidate.rootPath)
    )
    .sort((a, b) => a.path.localeCompare(b.path));
  const files: Array<{ path: string; content: Buffer }> = [];
  for (const entry of entries) {
    const relativePath = relativeGitHubPackagePath(entry.path, candidate.rootPath);
    if (!relativePath || shouldSkipPackageRelativePath(relativePath)) continue;
    files.push({
      path: relativePath,
      content: await fetchGitHubBlobBytes(candidate.owner, candidate.repo, entry.sha),
    });
  }
  if (!files.some((file) => file.path === SKILL_ENTRYPOINT)) {
    throw new Error(`GitHub skill package is missing ${SKILL_ENTRYPOINT}: ${candidate.htmlUrl}`);
  }
  return files;
}

function isGitHubEntryInSkillRoot(path: string, rootPath: string): boolean {
  if (!rootPath) {
    return path === SKILL_ENTRYPOINT ||
      path.startsWith("scripts/") ||
      path.startsWith("references/") ||
      path.startsWith("assets/");
  }
  return path.startsWith(`${rootPath}/`);
}

function relativeGitHubPackagePath(path: string, rootPath: string): string {
  return rootPath ? path.slice(rootPath.length + 1) : path;
}

function shouldSkipPackageRelativePath(path: string): boolean {
  return path.split("/").some((segment) =>
    segment.startsWith(".") || segment === "node_modules" || segment === ".." || segment === ""
  );
}

function hashSinglePackageFile(content: string): string {
  return hashPackageFiles([{ path: SKILL_ENTRYPOINT, content }]);
}

function hashPackageFiles(files: Array<{ path: string; content: string | Buffer }>): string {
  const hash = createHash("sha256");
  for (const file of files.sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path.replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(file.content);
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function walkPackageFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPackageFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}
