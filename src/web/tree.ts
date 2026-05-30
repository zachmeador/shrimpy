import { existsSync, promises as fs } from "node:fs";
import { basename, extname, join, sep } from "node:path";

export type FileKind =
  | "channel"
  | "session"
  | "jsonl"
  | "markdown"
  | "json"
  | "log"
  | "script"
  | "text"
  | "media"
  | "private"
  | "other";

export interface FileLeaf {
  type: "file";
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  kind: FileKind;
  readable: boolean;
}

export interface DirectoryNode {
  type: "directory";
  path: string;
  name: string;
  fileCount: number;
  children: TreeNode[];
}

export type TreeNode = DirectoryNode | FileLeaf;

export interface Tree {
  root: DirectoryNode;
}

const ROOT_ORDER = new Map(
  [
    "profile",
    "config",
    "agents",
    "channels",
    "media",
    "docs",
    "state",
    "runtime",
    "skills",
  ].map((name, index) => [name, index]),
);

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".mjs",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const PRIVATE_PATHS = new Set(["state/pi/auth.json"]);

function normalizeRel(path: string): string {
  return path.split(sep).join("/");
}

function isSessionLog(relPath: string): boolean {
  return /^agents\/[^/]+\/sessions\/[^/]+\/[^/]+\.jsonl$/.test(relPath);
}

export function classifyWorkspaceFile(relPath: string): {
  kind: FileKind;
  readable: boolean;
} {
  const normalized = normalizeRel(relPath);
  if (PRIVATE_PATHS.has(normalized)) return { kind: "private", readable: false };

  const ext = extname(normalized).toLowerCase();
  if (normalized.startsWith("channels/") && ext === ".jsonl") {
    return { kind: "channel", readable: true };
  }
  if (isSessionLog(normalized)) {
    return { kind: "session", readable: true };
  }
  if (ext === ".jsonl") return { kind: "jsonl", readable: true };
  if (ext === ".md") return { kind: "markdown", readable: true };
  if (ext === ".json") return { kind: "json", readable: true };
  if (ext === ".log") return { kind: "log", readable: true };
  if (ext === ".sh") return { kind: "script", readable: true };
  if (normalized.startsWith("media/")) return { kind: "media", readable: false };
  if (TEXT_EXTENSIONS.has(ext)) return { kind: "text", readable: true };
  return { kind: "other", readable: false };
}

function compareNodes(parentPath: string): (a: TreeNode, b: TreeNode) => number {
  return (a, b) => {
    if (parentPath === "") {
      const ao = ROOT_ORDER.get(a.name);
      const bo = ROOT_ORDER.get(b.name);
      if (ao !== undefined || bo !== undefined) {
        return (ao ?? Number.MAX_SAFE_INTEGER) - (bo ?? Number.MAX_SAFE_INTEGER);
      }
    }

    const filesByNewest =
      parentPath === "channels" ||
      /^agents\/[^/]+\/sessions\/[^/]+$/.test(parentPath);
    if (filesByNewest && a.type === "file" && b.type === "file") {
      return b.mtimeMs - a.mtimeMs;
    }

    if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
    return a.name.localeCompare(b.name);
  };
}

async function buildDirectory(absPath: string, relPath: string): Promise<DirectoryNode> {
  const entries = existsSync(absPath)
    ? await fs.readdir(absPath, { withFileTypes: true })
    : [];
  const children: TreeNode[] = [];
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;

    const childAbs = join(absPath, entry.name);
    const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const child = await buildDirectory(childAbs, childRel);
      children.push(child);
      fileCount += child.fileCount;
      continue;
    }

    if (!entry.isFile()) continue;
    const st = await fs.stat(childAbs);
    const classified = classifyWorkspaceFile(childRel);
    children.push({
      type: "file",
      path: childRel,
      name: entry.name,
      size: st.size,
      mtimeMs: st.mtimeMs,
      kind: classified.kind,
      readable: classified.readable,
    });
    fileCount++;
  }

  children.sort(compareNodes(relPath));
  return {
    type: "directory",
    path: relPath,
    name: relPath === "" ? "." : basename(relPath),
    fileCount,
    children,
  };
}

export async function buildTree(workspace: string): Promise<Tree> {
  return { root: await buildDirectory(workspace, "") };
}
