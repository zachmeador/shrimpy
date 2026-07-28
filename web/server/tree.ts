import { existsSync, promises as fs } from "node:fs";
import { basename, join } from "node:path";
import type {
  DirectoryNode,
  Tree,
  TreeLeaf,
  TreeNode,
} from "../shared/types.js";
import { encodeNodeId } from "./ids.js";
import {
  classifyWorkspaceFile,
  normalizeRelativePath,
  readJson,
  resolveAgents,
} from "./workspace.js";

const ROOT_ORDER = new Map([
  "context", "config", "agents", "channels", "media", "docs", "state",
  "runtime", "skills",
].map((name, index) => [name, index]));

export async function buildTree(workspace: string): Promise<Tree> {
  const [channels, agents, runtime, physical] = await Promise.all([
    buildChannels(workspace),
    buildAgents(workspace),
    buildRuntime(workspace),
    buildDirectory(workspace, "", "Workspace"),
  ]);
  const overview: TreeLeaf = {
    type: "file",
    id: encodeNodeId({ type: "overview" }),
    name: "Overview",
    size: 0,
    mtimeMs: Date.now(),
    kind: "overview",
    readable: true,
  };
  return {
    root: {
      type: "directory",
      id: "root",
      name: "Shrimpy",
      fileCount: 1 + channels.fileCount + agents.fileCount
        + runtime.fileCount + physical.fileCount,
      synthetic: true,
      children: [overview, channels, agents, runtime, physical],
    },
  };
}

async function buildChannels(workspace: string): Promise<DirectoryNode> {
  const directory = join(workspace, "channels");
  const entries = await safeReadDir(directory);
  const configured = readJson(join(workspace, "config", "channels.json"));
  const configuredChannels = typeof configured === "object"
    && configured !== null
    && !Array.isArray(configured)
    && typeof (configured as Record<string, unknown>).channels === "object"
    && (configured as Record<string, unknown>).channels !== null
    ? (configured as { channels: Record<string, unknown> }).channels
    : {};
  const names = new Set(Object.keys(configuredChannels));
  const filesByChannel = new Map<string, string>();
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const channel = entry.name.slice(0, -".jsonl".length);
      names.add(channel);
      filesByChannel.set(channel, entry.name);
    }
  }
  const leaves: TreeLeaf[] = [];
  for (const channel of names) {
    const fileName = filesByChannel.get(channel);
    const stat = fileName ? await fs.stat(join(directory, fileName)) : undefined;
    const membership = configuredChannels[channel];
    const agents = recordKeys(membership, "agents");
    leaves.push({
      type: "file",
      id: encodeNodeId({ type: "channel", channel }),
      name: channel,
      hint: agents.length > 0 ? agents.join(", ") : undefined,
      size: stat?.size ?? 0,
      mtimeMs: stat?.mtimeMs ?? 0,
      kind: "channel",
      readable: true,
    });
  }
  leaves.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return syntheticDirectory("channels", "Channels", leaves);
}

async function buildAgents(workspace: string): Promise<DirectoryNode> {
  const children: TreeNode[] = [];
  for (const agent of resolveAgents(workspace)) {
    const agentChildren: TreeNode[] = [{
      type: "file",
      id: encodeNodeId({ type: "agent", agentId: agent.id }),
      name: "Summary",
      size: 0,
      mtimeMs: 0,
      kind: "agent",
      readable: true,
    }];
    const sessions = await buildSessions(agent.id, agent.root);
    if (sessions.fileCount > 0) agentChildren.push(sessions);
    const watchesPath = join(agent.root, "watches.json");
    if (existsSync(watchesPath)) {
      const stat = await fs.stat(watchesPath);
      agentChildren.push({
        type: "file",
        id: encodeNodeId({ type: "watch", agentId: agent.id }),
        name: "Watches",
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        kind: "watch",
        readable: true,
      });
    }
    const agentDirectory = syntheticDirectory(
      `agent:${agent.id}`,
      agent.id,
      agentChildren,
    );
    children.push(agentDirectory);
  }
  return syntheticDirectory("agents", "Agents", children);
}

async function buildSessions(
  agentId: string,
  agentRoot: string,
): Promise<DirectoryNode> {
  const root = join(agentRoot, "sessions");
  const children: TreeNode[] = [];
  for (const namespaceEntry of await safeReadDir(root)) {
    if (!namespaceEntry.isDirectory()) continue;
    const namespacePath = join(root, namespaceEntry.name);
    const sessionLeaves: TreeLeaf[] = [];
    for (const nameEntry of await safeReadDir(namespacePath)) {
      if (!nameEntry.isDirectory()) continue;
      const namePath = join(namespacePath, nameEntry.name);
      for (const profileEntry of await safeReadDir(namePath)) {
        if (!profileEntry.isDirectory()) continue;
        const profilePath = join(namePath, profileEntry.name);
        const manifest = readJson(join(profilePath, "session.json"));
        const displayName = manifestKeyString(manifest, "name")
          ?? decodeDirectory(nameEntry.name);
        const profile = manifestKeyString(manifest, "profileId")
          ?? decodeDirectory(profileEntry.name);
        for (const fileEntry of await safeReadDir(profilePath)) {
          if (!fileEntry.isFile() || !fileEntry.name.endsWith(".jsonl")) continue;
          const path = join(profilePath, fileEntry.name);
          const stat = await fs.stat(path);
          const lifecycle = await readSessionLifecycle(path);
          sessionLeaves.push({
            type: "file",
            id: encodeNodeId({
              type: "session",
              agentId,
              namespace: namespaceEntry.name,
              nameDirectory: nameEntry.name,
              profileDirectory: profileEntry.name,
              file: fileEntry.name,
            }),
            name: displayName,
            hint: sessionHint(profile, lifecycle),
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            kind: "session",
            readable: true,
          });
        }
      }
    }
    sessionLeaves.sort((left, right) => right.mtimeMs - left.mtimeMs);
    if (sessionLeaves.length > 0) {
      children.push(syntheticDirectory(
        `sessions:${agentId}:${namespaceEntry.name}`,
        capitalize(namespaceEntry.name),
        sessionLeaves,
      ));
    }
  }
  return syntheticDirectory(`sessions:${agentId}`, "Sessions", children);
}

async function buildRuntime(workspace: string): Promise<DirectoryNode> {
  const paths = [
    ["Gateway health", "runtime/gateway-health.json"],
    ["Gateway state", "runtime/gateway-state.json"],
    ["Gateway log", "runtime/logs/gateway.log"],
    ["Watch clock", "state/watch-clock.json"],
    ["Watch load errors", "runtime/watches/load-errors.json"],
    ["Delivery receipts", "runtime/channel-deliveries.json"],
    ["Workers", "state/workers.json"],
  ] as const;
  const leaves: TreeLeaf[] = [];
  for (const [name, relPath] of paths) {
    const path = join(workspace, relPath);
    if (!existsSync(path)) continue;
    const stat = await fs.stat(path);
    if (!stat.isFile()) continue;
    leaves.push({
      type: "file",
      id: encodeNodeId({ type: "runtime", path: relPath }),
      name,
      hint: relPath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      kind: "runtime",
      readable: true,
    });
  }
  return syntheticDirectory("runtime", "Runtime", leaves);
}

async function buildDirectory(
  absolutePath: string,
  relativePath: string,
  label?: string,
): Promise<DirectoryNode> {
  const children: TreeNode[] = [];
  let fileCount = 0;
  for (const entry of await safeReadDir(absolutePath)) {
    if (entry.isSymbolicLink()) continue;
    const childAbsolute = join(absolutePath, entry.name);
    const childRelative = normalizeRelativePath(
      relativePath ? `${relativePath}/${entry.name}` : entry.name,
    );
    if (entry.isDirectory()) {
      const child = await buildDirectory(childAbsolute, childRelative);
      children.push(child);
      fileCount += child.fileCount;
    } else if (entry.isFile()) {
      const stat = await fs.stat(childAbsolute);
      const classified = classifyWorkspaceFile(childRelative);
      children.push({
        type: "file",
        id: encodeNodeId({ type: "file", path: childRelative }),
        name: entry.name,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        kind: classified.kind,
        readable: classified.readable,
      });
      fileCount++;
    }
  }
  children.sort(compareNodes(relativePath));
  return {
    type: "directory",
    id: `directory:${relativePath || "workspace"}`,
    name: label ?? basename(relativePath),
    fileCount,
    children,
  };
}

function compareNodes(parentPath: string): (a: TreeNode, b: TreeNode) => number {
  return (left, right) => {
    if (!parentPath) {
      const leftOrder = ROOT_ORDER.get(left.name);
      const rightOrder = ROOT_ORDER.get(right.name);
      if (leftOrder !== undefined || rightOrder !== undefined) {
        return (leftOrder ?? 1_000) - (rightOrder ?? 1_000);
      }
    }
    if (left.type !== right.type) return left.type === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name);
  };
}

function syntheticDirectory(
  id: string,
  name: string,
  children: TreeNode[],
): DirectoryNode {
  return {
    type: "directory",
    id,
    name,
    fileCount: children.reduce(
      (count, node) => count + (node.type === "file" ? 1 : node.fileCount),
      0,
    ),
    children,
    synthetic: true,
  };
}

async function safeReadDir(path: string) {
  try {
    return await fs.readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

function decodeDirectory(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8") || value;
  } catch {
    return value;
  }
}

function recordString(value: unknown, key: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" && field ? field : undefined;
}

function recordKeys(value: unknown, key: string): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [];
  }
  const field = (value as Record<string, unknown>)[key];
  if (typeof field !== "object" || field === null || Array.isArray(field)) {
    return [];
  }
  return Object.keys(field);
}

function manifestKeyString(value: unknown, field: string): string | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const key = (value as Record<string, unknown>).key;
  return recordString(key, field);
}

async function readSessionLifecycle(path: string): Promise<"active" | "archived"> {
  const stat = await fs.stat(path);
  const length = Math.min(stat.size, 64 * 1024);
  const handle = await fs.open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, stat.size - length);
    const lines = buffer.toString("utf8").split(/\r?\n/).reverse();
    for (const line of lines) {
      if (!line.includes("shrimpy_lifecycle")) continue;
      try {
        const value = JSON.parse(line) as {
          customType?: unknown;
          data?: { state?: unknown };
        };
        if (
          value.customType === "shrimpy_lifecycle"
          && value.data?.state === "archived"
        ) {
          return "archived";
        }
      } catch {
        // A malformed tail line should not hide the session.
      }
    }
    return "active";
  } finally {
    await handle.close();
  }
}

function sessionHint(
  profile: string,
  lifecycle: "active" | "archived",
): string | undefined {
  const parts = [];
  if (profile !== "default") parts.push(profile);
  if (lifecycle === "archived") parts.push("archived");
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function capitalize(value: string): string {
  return value ? `${value[0]?.toUpperCase()}${value.slice(1)}` : value;
}
