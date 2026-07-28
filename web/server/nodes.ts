import { existsSync, promises as fs } from "node:fs";
import { basename, join } from "node:path";
import type {
  JsonlNodeResponse,
  NodeKind,
  NodeMetadata,
  NodeResponse,
  OverviewNodeResponse,
  OverviewRow,
} from "../shared/types.js";
import { decodeNodeId, type NodeDescriptor } from "./ids.js";
import { readJsonl, readText } from "./read.js";
import {
  classifyWorkspaceFile,
  isRecord,
  normalizeRelativePath,
  readJson,
  resolveAgents,
  resolveContainedFile,
  revisionFor,
} from "./workspace.js";

const RUNTIME_PATHS = new Set([
  "runtime/gateway-health.json",
  "runtime/gateway-state.json",
  "runtime/logs/gateway.log",
  "state/watch-clock.json",
  "runtime/watches/load-errors.json",
  "runtime/channel-deliveries.json",
  "state/workers.json",
]);

export class NodeReadError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function readNode(
  workspace: string,
  id: string,
  cursor?: number,
  anchor?: string,
): Promise<NodeResponse> {
  const descriptor = decodeNodeId(id);
  if (!descriptor) throw new NodeReadError(400, "invalid node id");
  switch (descriptor.type) {
    case "overview":
      return readOverview(workspace, id);
    case "agent":
      return readAgent(workspace, id, descriptor.agentId);
    case "agent-file":
      return readAgentScopedFile(
        workspace,
        id,
        descriptor.agentId,
        descriptor.path,
        cursor,
        anchor,
      );
    case "watch":
      return readAgentFile(
        workspace,
        id,
        descriptor.agentId,
        "watches.json",
        "Watches",
        "watch",
      );
    case "channel":
      return readChannel(workspace, id, descriptor.channel, cursor, anchor);
    case "runtime":
      if (!RUNTIME_PATHS.has(descriptor.path)) {
        throw new NodeReadError(403, "runtime node is not exposed");
      }
      return readWorkspaceBackedNode(
        workspace,
        id,
        descriptor,
        descriptor.path,
        "runtime",
        cursor,
        anchor,
      );
    case "file": {
      const classified = classifyWorkspaceFile(descriptor.path);
      if (!classified.readable) {
        throw new NodeReadError(403, `${classified.kind} files are not readable`);
      }
      return readWorkspaceBackedNode(
        workspace,
        id,
        descriptor,
        descriptor.path,
        classified.kind,
        cursor,
        anchor,
      );
    }
    case "session":
      return readSession(workspace, id, descriptor, cursor, anchor);
  }
}

async function readAgentScopedFile(
  workspace: string,
  id: string,
  agentId: string,
  requestedPath: string,
  cursor?: number,
  anchor?: string,
): Promise<NodeResponse> {
  const relativePath = normalizeRelativePath(requestedPath);
  if (
    relativePath !== requestedPath
    || !isAgentScopedPath(relativePath)
  ) {
    throw new NodeReadError(403, "agent path is not exposed");
  }
  const classified = classifyWorkspaceFile(relativePath);
  if (!classified.readable) {
    throw new NodeReadError(403, `${classified.kind} files are not readable`);
  }
  const agent = resolveAgents(workspace).find(
    (candidate) => candidate.id === agentId,
  );
  if (!agent) throw new NodeReadError(404, "agent no longer exists");
  const path = await resolveContainedFile(agent.root, relativePath);
  if (!path) throw new NodeReadError(404, "agent file no longer exists");
  return readFileResponse(
    id,
    basename(relativePath),
    classified.kind,
    path,
    `${agentId}/${relativePath}`,
    cursor,
    anchor,
    [{ label: "agent", value: agentId }],
  );
}

function isAgentScopedPath(path: string): boolean {
  return path === "SOUL.md"
    || path.startsWith("context/")
    || path.startsWith("skills/");
}

async function readChannel(
  workspace: string,
  id: string,
  channel: string,
  cursor?: number,
  anchor?: string,
): Promise<NodeResponse> {
  const memberships = readJson(join(workspace, "config", "channels.json"));
  const configured = isRecord(memberships)
    && isRecord(memberships.channels)
    && isRecord(memberships.channels[channel])
    ? memberships.channels[channel]
    : undefined;
  const relativePath = `channels/${channel}.jsonl`;
  const path = await resolveContainedFile(workspace, relativePath);
  const agents = configured && isRecord(configured.agents)
    ? Object.keys(configured.agents)
    : [];
  if (path) {
    return readFileResponse(
      id,
      channel,
      "channel",
      path,
      relativePath,
      cursor,
      anchor,
      agents.length > 0
        ? [{ label: "agents", value: agents.join(", ") }]
        : [],
    );
  }
  if (!configured) throw new NodeReadError(404, "channel no longer exists");
  return {
    id,
    label: channel,
    kind: "channel",
    metadata: [{ label: "path", value: relativePath }],
    revision: String(Date.now()),
    mode: "overview",
    sections: [{
      title: "Channel",
      rows: [
        overviewRow("log", "not created", "dim"),
        overviewRow("agents", agents.join(", ") || "none"),
        overviewRow(
          "manifest",
          isRecord(configured.manifest)
            ? JSON.stringify(configured.manifest)
            : "derived",
        ),
      ],
    }],
  };
}

async function readAgentFile(
  workspace: string,
  id: string,
  agentId: string,
  relativePath: string,
  label: string,
  kind: NodeKind,
): Promise<NodeResponse> {
  const agent = resolveAgents(workspace).find(
    (candidate) => candidate.id === agentId,
  );
  if (!agent) throw new NodeReadError(404, "agent no longer exists");
  const path = await resolveContainedFile(agent.root, relativePath);
  if (!path) throw new NodeReadError(404, "agent file no longer exists");
  return readFileResponse(
    id,
    label,
    kind,
    path,
    `${agentId}/${relativePath}`,
    undefined,
    undefined,
    [{ label: "agent", value: agentId }],
  );
}

async function readWorkspaceBackedNode(
  workspace: string,
  id: string,
  descriptor: Extract<NodeDescriptor, { path: string }> | Extract<NodeDescriptor, { type: "channel" }>,
  relativePath: string,
  kind: NodeKind,
  cursor?: number,
  anchor?: string,
): Promise<NodeResponse> {
  const path = await resolveContainedFile(workspace, relativePath);
  if (!path) throw new NodeReadError(404, "node no longer exists");
  const label = descriptor.type === "channel"
    ? descriptor.channel
    : basename(relativePath);
  return readFileResponse(id, label, kind, path, relativePath, cursor, anchor);
}

async function readSession(
  workspace: string,
  id: string,
  descriptor: Extract<NodeDescriptor, { type: "session" }>,
  cursor?: number,
  anchor?: string,
): Promise<NodeResponse> {
  if (
    !["local", "channel", "worker"].includes(descriptor.namespace)
    || basename(descriptor.nameDirectory) !== descriptor.nameDirectory
    || basename(descriptor.profileDirectory) !== descriptor.profileDirectory
    || basename(descriptor.file) !== descriptor.file
    || !descriptor.file.endsWith(".jsonl")
  ) {
    throw new NodeReadError(400, "invalid session node");
  }
  const agent = resolveAgents(workspace).find(
    (candidate) => candidate.id === descriptor.agentId,
  );
  if (!agent) throw new NodeReadError(404, "agent no longer exists");
  const relativePath = [
    "sessions",
    descriptor.namespace,
    descriptor.nameDirectory,
    descriptor.profileDirectory,
    descriptor.file,
  ].join("/");
  const path = await resolveContainedFile(agent.root, relativePath);
  if (!path) throw new NodeReadError(404, "session no longer exists");
  const manifest = readJson(join(
    agent.root,
    "sessions",
    descriptor.namespace,
    descriptor.nameDirectory,
    descriptor.profileDirectory,
    "session.json",
  ));
  const label = manifestKeyString(manifest, "name")
    ?? decodeDirectory(descriptor.nameDirectory);
  return readFileResponse(
    id,
    label,
    "session",
    path,
    `${descriptor.agentId}/${relativePath}`,
    cursor,
    anchor,
    [
      { label: "agent", value: descriptor.agentId },
      { label: "namespace", value: descriptor.namespace },
      {
        label: "profile",
        value: manifestKeyString(manifest, "profileId")
          ?? decodeDirectory(descriptor.profileDirectory),
      },
    ],
    false,
  );
}

async function readFileResponse(
  id: string,
  label: string,
  kind: NodeKind,
  path: string,
  relativePath: string,
  cursor?: number,
  anchor?: string,
  extraMetadata: NodeMetadata[] = [],
  includePathMetadata = true,
): Promise<NodeResponse> {
  const stat = await fs.stat(path);
  const metadata: NodeMetadata[] = [
    ...extraMetadata,
    ...(includePathMetadata ? [{ label: "path", value: relativePath }] : []),
  ];
  const base = {
    id,
    label,
    kind,
    metadata,
    revision: revisionFor(stat),
    sourcePath: relativePath,
    mtimeMs: stat.mtimeMs,
  };
  const extension = basename(path).split(".").at(-1)?.toLowerCase();
  if (
    kind === "channel"
    || kind === "session"
    || kind === "jsonl"
    || extension === "jsonl"
  ) {
    const result = await readJsonl(path, cursor, anchor);
    return { ...base, mode: "jsonl", ...result } satisfies JsonlNodeResponse;
  }
  const result = await readText(path);
  if (extension === "json") {
    try {
      result.text = `${JSON.stringify(JSON.parse(result.text), null, 2)}\n`;
    } catch {
      // Keep malformed or truncated JSON inspectable as raw text.
    }
  }
  return { ...base, mode: "text", ...result };
}

async function readOverview(
  workspace: string,
  id: string,
): Promise<OverviewNodeResponse> {
  const health = readJson(join(workspace, "runtime", "gateway-health.json"));
  const watchClock = readJson(join(workspace, "state", "watch-clock.json"));
  const channels = readJson(join(workspace, "config", "channels.json"));
  const agents = resolveAgents(workspace);
  const channelCount = isRecord(channels) && isRecord(channels.channels)
    ? Object.keys(channels.channels).length
    : await countFiles(join(workspace, "channels"), ".jsonl");
  const gatewayStatus = recordString(health, "pid") ? "running" : (
    isRecord(health) && typeof health.pid === "number" ? "running" : "unknown"
  );
  const sections = [
    {
      title: "Gateway",
      rows: [
        overviewRow("status", gatewayStatus, gatewayStatus === "running" ? "good" : "warn"),
        overviewRow("pid", recordValue(health, "pid")),
        overviewRow("heartbeat", formatTimestamp(recordValue(health, "heartbeatAt"))),
        overviewRow("web", webStatus(health)),
      ],
    },
    {
      title: "Workspace",
      rows: [
        overviewRow("path", workspace),
        overviewRow("agents", String(agents.length)),
        overviewRow("channels", String(channelCount)),
        overviewRow("watch schedules", String(recordSize(watchClock))),
      ],
    },
  ];
  return {
    id,
    label: "Overview",
    kind: "overview",
    metadata: [{ label: "workspace", value: workspace }],
    revision: String(Date.now()),
    mode: "overview",
    sections,
  };
}

async function readAgent(
  workspace: string,
  id: string,
  agentId: string,
): Promise<OverviewNodeResponse> {
  const agent = resolveAgents(workspace).find((candidate) => candidate.id === agentId);
  if (!agent) throw new NodeReadError(404, "agent no longer exists");
  const sections = [{
    title: "Agent",
    rows: [
      overviewRow("id", agent.id),
      overviewRow("root", agent.root),
      overviewRow("sessions", String(await countNestedJsonl(join(agent.root, "sessions")))),
      overviewRow(
        "watches",
        existsSync(join(agent.root, "watches.json")) ? "configured" : "none",
      ),
      overviewRow(
        "SOUL.md",
        existsSync(join(agent.root, "SOUL.md")) ? "present" : "missing",
        existsSync(join(agent.root, "SOUL.md")) ? "good" : "warn",
      ),
    ],
  }];
  return {
    id,
    label: agent.id,
    kind: "agent",
    metadata: [{ label: "root", value: agent.root }],
    revision: String(Date.now()),
    mode: "overview",
    sections,
  };
}

function overviewRow(
  label: string,
  value: string,
  tone: OverviewRow["tone"] = "normal",
): OverviewRow {
  return { label, value, tone };
}

function recordValue(value: unknown, key: string): string {
  if (!isRecord(value)) return "—";
  const field = value[key];
  if (typeof field === "string" || typeof field === "number") return String(field);
  return "—";
}

function recordString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const field = value[key];
  return typeof field === "string" && field ? field : undefined;
}

function manifestKeyString(value: unknown, field: string): string | undefined {
  if (!isRecord(value)) return undefined;
  return recordString(value.key, field);
}

function recordSize(value: unknown): number {
  if (!isRecord(value)) return 0;
  if (isRecord(value.entries)) return Object.keys(value.entries).length;
  return Object.keys(value).length;
}

function webStatus(health: unknown): string {
  if (!isRecord(health) || !isRecord(health.web)) return "unreported";
  return recordValue(health.web, "status");
}

function formatTimestamp(value: string): string {
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds)) return value;
  return new Date(milliseconds).toISOString();
}

async function countFiles(directory: string, extension: string): Promise<number> {
  try {
    return (await fs.readdir(directory)).filter((name) => name.endsWith(extension)).length;
  } catch {
    return 0;
  }
}

async function countNestedJsonl(root: string): Promise<number> {
  let count = 0;
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) pending.push(join(directory, entry.name));
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) count++;
    }
  }
  return count;
}

function decodeDirectory(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8") || value;
  } catch {
    return value;
  }
}
