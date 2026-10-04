import { promises as fs } from "node:fs";
import { basename, join } from "node:path";
import type {
  JsonlNodeResponse,
  NodeKind,
  NodeMetadata,
  NodeResponse,
  OverviewNodeResponse,
  OverviewRow,
  WatchRow,
  WatchesNodeResponse,
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
      return readWatches(workspace, id, descriptor.agentId);
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

async function readWatches(
  workspace: string,
  id: string,
  agentId: string,
): Promise<NodeResponse> {
  const agent = resolveAgents(workspace).find(
    (candidate) => candidate.id === agentId,
  );
  if (!agent) throw new NodeReadError(404, "agent no longer exists");
  const path = await resolveContainedFile(agent.root, "watches.json");
  if (!path) throw new NodeReadError(404, "agent file no longer exists");
  const result = await readText(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text) as unknown;
  } catch {
    parsed = undefined;
  }
  if (result.truncated || !Array.isArray(parsed)) {
    return readFileResponse(
      id,
      "Watches",
      "watch",
      path,
      `${agentId}/watches.json`,
      undefined,
      undefined,
      [{ label: "agent", value: agentId }],
    );
  }

  const stat = await fs.stat(path);
  const watchClock = readJson(join(workspace, "state", "watch-clock.json"));
  const watches = parsed.flatMap((value): WatchRow[] => {
    if (!isRecord(value) || typeof value.id !== "string" || !value.id) return [];
    const trigger = isRecord(value.trigger) ? value.trigger : {};
    const clockKey = `${agentId}/${value.id}`;
    const clock = isRecord(watchClock) && isRecord(watchClock[clockKey])
      ? watchClock[clockKey]
      : undefined;
    const nextRunAtMs = clock && typeof clock.nextRunAtMs === "number"
      && Number.isFinite(clock.nextRunAtMs)
      ? clock.nextRunAtMs
      : undefined;
    return [{
      id: value.id,
      name: typeof value.name === "string" && value.name ? value.name : value.id,
      triggerKind: typeof trigger.kind === "string" ? trigger.kind : "unknown",
      schedule: watchSchedule(
        trigger,
        typeof value.timezone === "string" ? value.timezone : undefined,
      ),
      nextRunAtMs,
      concurrencyPolicy: typeof value.concurrencyPolicy === "string"
        ? value.concurrencyPolicy
        : "forbid",
      enabled: value.enabled !== false,
      raw: value,
    }];
  });
  return {
    id,
    label: "Watches",
    kind: "watch",
    metadata: [{ label: "agent", value: agentId }],
    revision: revisionFor(stat),
    sourcePath: `${agentId}/watches.json`,
    mtimeMs: stat.mtimeMs,
    mode: "watches",
    watches,
    truncated: false,
    totalSize: stat.size,
  } satisfies WatchesNodeResponse;
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
  const config = readJson(join(workspace, "config", "shrimpy.json"));
  const rawAgents: unknown = isRecord(config) ? config.agents : undefined;
  const configuredAgent: unknown = Array.isArray(rawAgents)
    ? rawAgents.find(
      (candidate) => isRecord(candidate) && candidate.id === agentId,
    )
    : undefined;
  const channels = readJson(join(workspace, "config", "channels.json"));
  const channelNames = isRecord(channels) && isRecord(channels.channels)
    ? Object.entries(channels.channels).flatMap(([name, value]) =>
      isRecord(value) && isRecord(value.agents) && agentId in value.agents
        ? [name]
        : []
    )
    : [];
  const sessions = await sessionSummary(join(agent.root, "sessions"));
  const rawWatches = readJson(join(agent.root, "watches.json"));
  const watches = Array.isArray(rawWatches)
    ? rawWatches.filter((watch) => isRecord(watch))
    : [];
  const enabledWatches = watches.filter((watch) => watch.enabled !== false).length;
  const modelPolicy = isRecord(configuredAgent)
    ? displayValue(configuredAgent.modelPolicy)
    : "default";
  const sections = [{
    title: "Agent",
    rows: [
      overviewRow(
        "last activity",
        sessions.lastActivityMs
          ? new Date(sessions.lastActivityMs).toISOString()
          : "none",
        sessions.lastActivityMs ? "normal" : "dim",
      ),
      overviewRow("model policy", modelPolicy),
      overviewRow("channels", channelNames.join(", ") || "none"),
      overviewRow(
        "sessions",
        ["local", "channel", "worker"]
          .map((namespace) => `${namespace} ${sessions.counts[namespace] ?? 0}`)
          .join(" · "),
      ),
      overviewRow(
        "watches",
        watches.length > 0
          ? `${enabledWatches}/${watches.length} enabled`
          : "none",
        enabledWatches > 0 ? "good" : "dim",
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

function watchSchedule(
  trigger: Record<string, unknown>,
  watchTimezone?: string,
): string {
  if (typeof trigger.cron === "string" && trigger.cron) {
    const timezone = typeof trigger.timezone === "string" && trigger.timezone
      ? trigger.timezone
      : watchTimezone;
    const timezoneSuffix = timezone
      ? ` · ${timezone}`
      : "";
    return `${trigger.cron}${timezoneSuffix}`;
  }
  if (typeof trigger.everyMs === "number" && Number.isFinite(trigger.everyMs)) {
    return formatDuration(trigger.everyMs);
  }
  return "—";
}

function formatDuration(milliseconds: number): string {
  if (milliseconds % 86_400_000 === 0) return `${milliseconds / 86_400_000}d`;
  if (milliseconds % 3_600_000 === 0) return `${milliseconds / 3_600_000}h`;
  if (milliseconds % 60_000 === 0) return `${milliseconds / 60_000}m`;
  if (milliseconds % 1_000 === 0) return `${milliseconds / 1_000}s`;
  return `${milliseconds}ms`;
}

function displayValue(value: unknown): string {
  if (value === undefined) return "default";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "configured";
  }
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

async function sessionSummary(root: string): Promise<{
  counts: Record<string, number>;
  lastActivityMs: number;
}> {
  const counts: Record<string, number> = {};
  let lastActivityMs = 0;
  for (const namespace of ["local", "channel", "worker"]) {
    const directory = join(root, namespace);
    counts[namespace] = await countNestedJsonl(directory);
    const pending = [directory];
    while (pending.length > 0) {
      const current = pending.pop()!;
      let entries;
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
          pending.push(path);
        } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
          const stat = await fs.stat(path);
          lastActivityMs = Math.max(lastActivityMs, stat.mtimeMs);
        }
      }
    }
  }
  return { counts, lastActivityMs };
}

function decodeDirectory(value: string): string {
  try {
    return Buffer.from(value, "base64url").toString("utf8") || value;
  } catch {
    return value;
  }
}
