import { existsSync, readdirSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import {
  sessionResetMessageInput,
  sessionRestoreMessageInput,
  sessionThinkingLevelMessageInput,
} from "../channels/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import { isLocalDirectChannel } from "./direct-channels.js";
import { openDirectAgentSession } from "./direct.js";
import { createGatewaySessionDescriptor } from "./spec.js";
import {
  archiveSessionDir,
  findActiveSessionFile,
  listArchivedSessionDirs,
  resolveArchivedSessionDir,
  restoreArchivedSessionDir,
} from "./storage.js";

type SessionLifecycleAction = "new" | "clear" | "restore";

export interface SessionPathSummary {
  name: string;
  path: string;
  exists: boolean;
  updatedAt: string | null;
}

export interface SingleSessionListingSummary {
  channel: string;
  active: SessionPathSummary;
  archives: SessionPathSummary[];
}

export interface SessionListingSummary {
  agentId: string;
  sessionsRoot: string;
  active: Array<SessionPathSummary & { channel: string }>;
  recentArchives: Array<SessionPathSummary & { channel: string }>;
}

type SessionLifecycleResult =
  | {
    kind: "local_reset";
    agentId: string;
    channel: string;
    archivedTo?: string;
  }
  | {
    kind: "local_restore";
    agentId: string;
    channel: string;
    restoredFrom: string;
    archivedPreviousTo?: string;
  }
  | {
    kind: "requested_reset";
    action: "new" | "clear";
    agentId: string;
    channel: string;
  }
  | {
    kind: "requested_restore";
    agentId: string;
    channel: string;
    archiveName?: string;
    requestedArchive?: string;
  };

type SessionThinkingResult =
  | {
    kind: "local_thinking";
    agentId: string;
    channel: string;
    requestedLevel: ThinkingLevel;
    effectiveLevel: ThinkingLevel;
  }
  | {
    kind: "requested_thinking";
    agentId: string;
    channel: string;
    level: ThinkingLevel;
  };

export function summarizeAgentSessions(
  runtime: AppRuntime,
  opts?: {
    agentId?: string;
    channel?: string;
  },
): SessionListingSummary | SingleSessionListingSummary {
  const agent = runtime.getAgent(opts?.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const sessionsRoot = `${agentRoot}/sessions`;

  if (opts?.channel) {
    const sessionDir = createGatewaySessionDescriptor({
      workspacePath: agentRoot,
      agentId: agent.id,
      channel: opts.channel,
    }).sessionDir;
    return {
      channel: opts.channel,
      active: summarizeActiveSessionPath(sessionDir),
      archives: listArchivedSessionDirs(sessionDir).map(summarizeSessionPath),
    };
  }

  const sessionDirs = !existsSync(sessionsRoot)
    ? []
    : readdirSync(sessionsRoot).map((entry) => ({
      channel: entry,
      path: `${sessionsRoot}/${entry}`,
    }));

  const active = sessionDirs
    .map((entry) => ({
      channel: entry.channel,
      path: findActiveSessionFile(entry.path),
    }))
    .filter((entry): entry is { channel: string; path: string } =>
      entry.path !== undefined
    )
    .map((entry) => ({
      channel: entry.channel,
      ...summarizeSessionPath(entry.path),
    }));

  const recentArchives = sessionDirs
    .flatMap((summary) =>
      listArchivedSessionDirs(summary.path).map((path) => ({
        channel: summary.channel,
        ...summarizeSessionPath(path),
      }))
    )
    .sort((a, b) => b.path.localeCompare(a.path))
    .slice(0, 20);

  return {
    agentId: agent.id,
    sessionsRoot,
    active,
    recentArchives,
  };
}

export function executeSessionLifecycleAction(
  runtime: AppRuntime,
  input: {
    action: SessionLifecycleAction;
    channel: string;
    agentId?: string;
    archive?: string;
  },
): SessionLifecycleResult {
  const agent = runtime.getAgent(input.agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const sessionDir = createGatewaySessionDescriptor({
    workspacePath: agentRoot,
    agentId: agent.id,
    channel: input.channel,
  }).sessionDir;

  if (isLocalDirectChannel(input.channel)) {
    return executeLocalSessionLifecycle({
      action: input.action,
      sessionDir,
      channel: input.channel,
      agentId: agent.id,
      archive: input.archive,
    });
  }

  const channelBus = runtime.createChannelBus();

  if (input.action === "restore") {
    const archivePath = input.archive
      ? resolveArchivedSessionDir(sessionDir, input.archive)
      : undefined;
    if (input.archive && !archivePath) {
      throw new Error(`archive not found for ${agent.id}/${input.channel}: ${input.archive}`);
    }

    channelBus.publish(sessionRestoreMessageInput({
      channel: input.channel,
      targetAgentId: agent.id,
      archiveName: archivePath ? basename(archivePath) : undefined,
      sender: cliSender(),
      origin: cliOrigin(input.channel),
      command: "/restore",
    }));

    return {
      kind: "requested_restore",
      agentId: agent.id,
      channel: input.channel,
      archiveName: archivePath ? basename(archivePath) : undefined,
      requestedArchive: input.archive,
    };
  }

  channelBus.publish(sessionResetMessageInput({
    channel: input.channel,
    targetAgentId: agent.id,
    sender: cliSender(),
    origin: cliOrigin(input.channel),
    command: `/${input.action}`,
  }));

  return {
    kind: "requested_reset",
    action: input.action,
    agentId: agent.id,
    channel: input.channel,
  };
}

export async function executeSessionThinkingAction(
  runtime: AppRuntime,
  input: {
    channel: string;
    level: ThinkingLevel;
    agentId?: string;
  },
): Promise<SessionThinkingResult> {
  const agent = runtime.getAgent(input.agentId);

  if (isLocalDirectChannel(input.channel)) {
    const { session } = await openDirectAgentSession({
      runtime,
      agentId: agent.id,
      channel: input.channel,
      sessionType: input.channel,
      thinking: input.level,
      cwd: process.cwd(),
    });

    try {
      return {
        kind: "local_thinking",
        agentId: agent.id,
        channel: input.channel,
        requestedLevel: input.level,
        effectiveLevel: session.thinkingLevel as ThinkingLevel,
      };
    } finally {
      session.dispose();
    }
  }

  runtime.createChannelBus().publish(sessionThinkingLevelMessageInput({
    channel: input.channel,
    targetAgentId: agent.id,
    level: input.level,
    sender: cliSender(),
    origin: cliOrigin(input.channel),
    command: "/thinking",
  }));

  return {
    kind: "requested_thinking",
    agentId: agent.id,
    channel: input.channel,
    level: input.level,
  };
}

function executeLocalSessionLifecycle(input: {
  action: SessionLifecycleAction;
  sessionDir: string;
  channel: string;
  agentId: string;
  archive?: string;
}): SessionLifecycleResult {
  if (input.action === "restore") {
    const restored = restoreArchivedSessionDir(input.sessionDir, input.archive);
    if (!restored) {
      throw new Error(
        input.archive
          ? `archive not found for ${input.agentId}/${input.channel}: ${input.archive}`
          : `no archived sessions for ${input.agentId}/${input.channel}`,
      );
    }

    return {
      kind: "local_restore",
      agentId: input.agentId,
      channel: input.channel,
      restoredFrom: restored.restoredFrom,
      archivedPreviousTo: restored.archivedPreviousTo,
    };
  }

  return {
    kind: "local_reset",
    agentId: input.agentId,
    channel: input.channel,
    archivedTo: archiveSessionDir(input.sessionDir),
  };
}

function summarizeSessionPath(path: string): SessionPathSummary {
  const exists = existsSync(path);
  return {
    name: basename(path),
    path,
    exists,
    updatedAt: exists ? new Date(statSync(path).mtimeMs).toISOString() : null,
  };
}

function summarizeActiveSessionPath(sessionDir: string): SessionPathSummary {
  const active = findActiveSessionFile(sessionDir);
  if (active) return summarizeSessionPath(active);

  return {
    name: basename(sessionDir),
    path: sessionDir,
    exists: false,
    updatedAt: null,
  };
}

function cliSender() {
  return {
    kind: "system" as const,
    actorId: "system:cli",
    displayName: "shrimpy-cli",
  };
}

function cliOrigin(channel: string) {
  return {
    transport: "cli",
    sourceChannel: channel,
  };
}
