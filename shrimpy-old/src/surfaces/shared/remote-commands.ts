import {
  sessionResetMessageInput,
  sessionStopMessageInput,
  sessionThinkingLevelMessageInput,
  type MessageOrigin,
  type MessageSender,
  type PublishChannelMessageInput,
} from "../../channels/protocol.js";
import {
  parseThinkingLevel,
  type ThinkingLevel,
} from "../../config/thinking.js";

export type RemoteCommandPermission = "none" | "read-only" | "full";

export type RemoteCommandName =
  | "new"
  | "clear"
  | "stop"
  | "thinking"
  | "status"
  | "help";

export type RemoteCommandLanePhase =
  | "idle"
  | "running"
  | "queued"
  | "recently-failed"
  | "unknown";

export interface RemoteCommandLaneStatus {
  phase: RemoteCommandLanePhase;
  queueDepth: number;
  runningSince?: number;
  failedAt?: number;
}

export interface RemoteCommandStatusDetails {
  lane: RemoteCommandLaneStatus;
  thinking?: ThinkingLevel;
  model?: {
    provider: string;
    id: string;
  };
}

export interface RemoteCommandDefinition {
  name: RemoteCommandName;
  usage: string;
  description: string;
  requiredPermission: Exclude<RemoteCommandPermission, "none">;
}

export interface RemoteCommandEnvelope {
  name: string;
  rawArgs?: string;
}

export interface RemoteCommandContext {
  surfaceId: string;
  threadId: string;
  channel: string;
  targetAgentId: string;
  defaultAgentId: string;
  sender: MessageSender;
  origin: MessageOrigin;
  permission: RemoteCommandPermission;
  supportedCommands: readonly RemoteCommandName[];
}

export type RemoteCommandReply =
  | { kind: "unauthorized" }
  | { kind: "unknown" }
  | {
      kind: "usage";
      command: RemoteCommandName;
      usage: string;
      detail?: string;
    }
  | {
      kind: "help";
      commands: RemoteCommandDefinition[];
    }
  | {
      kind: "status";
      status: RemoteCommandStatusDetails;
    }
  | {
      kind: "unavailable";
      command: RemoteCommandName;
    };

export type RemoteCommandResult =
  | {
      kind: "reply";
      reply: RemoteCommandReply;
    }
  | {
      kind: "control";
      message: PublishChannelMessageInput;
    };

export interface RemoteCommandServiceDeps {
  readStatus(context: RemoteCommandContext):
    | RemoteCommandStatusDetails
    | Promise<RemoteCommandStatusDetails>;
}

const REMOTE_COMMAND_DEFINITIONS: readonly RemoteCommandDefinition[] = [
  {
    name: "new",
    usage: "/new",
    description: "Start a fresh session for the current agent",
    requiredPermission: "full",
  },
  {
    name: "clear",
    usage: "/clear",
    description: "Alias for /new",
    requiredPermission: "full",
  },
  {
    name: "stop",
    usage: "/stop",
    description: "Stop the running turn",
    requiredPermission: "full",
  },
  {
    name: "thinking",
    usage: "/thinking <level>",
    description: "Set the session thinking level",
    requiredPermission: "full",
  },
  {
    name: "status",
    usage: "/status",
    description: "Show current chat status",
    requiredPermission: "read-only",
  },
  {
    name: "help",
    usage: "/help",
    description: "Show available remote commands",
    requiredPermission: "read-only",
  },
];

const DEFINITION_BY_NAME = new Map(
  REMOTE_COMMAND_DEFINITIONS.map((definition) => [definition.name, definition]),
);

const PERMISSION_RANK: Readonly<Record<RemoteCommandPermission, number>> = {
  none: 0,
  "read-only": 1,
  full: 2,
};

export function listRemoteCommandDefinitions(): RemoteCommandDefinition[] {
  return REMOTE_COMMAND_DEFINITIONS.map((definition) => ({ ...definition }));
}

export async function executeRemoteCommand(
  deps: RemoteCommandServiceDeps,
  context: RemoteCommandContext,
  envelope: RemoteCommandEnvelope,
): Promise<RemoteCommandResult> {
  if (!hasAuthenticatedSender(context) || context.permission === "none") {
    return reply({ kind: "unauthorized" });
  }

  const name = normalizeCommandName(envelope.name);
  const definition = name ? DEFINITION_BY_NAME.get(name) : undefined;
  if (
    !definition
    || !context.supportedCommands.includes(definition.name)
  ) {
    return reply({ kind: "unknown" });
  }

  if (!permissionAllows(context.permission, definition.requiredPermission)) {
    return reply({ kind: "unauthorized" });
  }

  const args = envelope.rawArgs?.trim() ?? "";
  if (definition.name !== "thinking" && args) {
    return usageReply(definition);
  }

  switch (definition.name) {
    case "help":
      return reply({
        kind: "help",
        commands: REMOTE_COMMAND_DEFINITIONS
          .filter((candidate) =>
            context.supportedCommands.includes(candidate.name)
            && permissionAllows(context.permission, candidate.requiredPermission)
          )
          .map((candidate) => ({ ...candidate })),
      });

    case "status":
      try {
        return reply({
          kind: "status",
          status: await deps.readStatus(context),
        });
      } catch (err) {
        console.error("[remote-command] status collection failed:", err);
        return reply({ kind: "unavailable", command: "status" });
      }

    case "new":
    case "clear":
      return {
        kind: "control",
        message: sessionResetMessageInput({
          channel: context.channel,
          targetAgentId: context.targetAgentId,
          sender: context.sender,
          origin: commandOrigin(context),
          command: `/${definition.name}`,
        }),
      };

    case "stop":
      return {
        kind: "control",
        message: sessionStopMessageInput({
          channel: context.channel,
          targetAgentId: context.targetAgentId,
          sender: context.sender,
          origin: commandOrigin(context),
          command: "/stop",
        }),
      };

    case "thinking": {
      const parts = args.split(/\s+/u).filter(Boolean);
      if (parts.length !== 1) return usageReply(definition);
      const level = parseThinkingLevel(parts[0]);
      if (!level) {
        return usageReply(definition, `Invalid thinking level: ${parts[0]}`);
      }
      return {
        kind: "control",
        message: sessionThinkingLevelMessageInput({
          channel: context.channel,
          targetAgentId: context.targetAgentId,
          level,
          sender: context.sender,
          origin: commandOrigin(context),
          command: "/thinking",
        }),
      };
    }
  }
}

function hasAuthenticatedSender(context: RemoteCommandContext): boolean {
  return context.sender.kind === "human"
    && Boolean(context.sender.actorId.trim())
    && Boolean(context.sender.userId?.trim());
}

function normalizeCommandName(value: string): RemoteCommandName | undefined {
  const normalized = value.trim().toLowerCase();
  return DEFINITION_BY_NAME.has(normalized as RemoteCommandName)
    ? normalized as RemoteCommandName
    : undefined;
}

function permissionAllows(
  actual: RemoteCommandPermission,
  required: Exclude<RemoteCommandPermission, "none">,
): boolean {
  return PERMISSION_RANK[actual] >= PERMISSION_RANK[required];
}

function commandOrigin(context: RemoteCommandContext): MessageOrigin {
  return {
    ...context.origin,
    sourceChannel: context.channel,
  };
}

function reply(value: RemoteCommandReply): RemoteCommandResult {
  return { kind: "reply", reply: value };
}

function usageReply(
  definition: RemoteCommandDefinition,
  detail?: string,
): RemoteCommandResult {
  return reply({
    kind: "usage",
    command: definition.name,
    usage: definition.usage,
    ...(detail ? { detail } : {}),
  });
}
