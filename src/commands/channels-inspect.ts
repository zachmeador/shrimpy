import { existsSync, statSync } from "node:fs";
import type { AppRuntime } from "../app/index.js";
import type { ChannelBus } from "../channels/bus.js";
import { printChannelLogMessage, timeSince } from "../channels/format.js";
import {
  CHANNEL_MESSAGE_KINDS,
  formatChannelAgentIds,
  listChannelSummaries,
  readRecentChannelMessages,
  searchChannelMessages,
  summarizeChannel,
  type ChannelMessageInspection,
  type ChannelMessageKind,
  type ChannelSearchFilters,
} from "../channels/service.js";
import { accent, dim, label } from "../util/style.js";
import { renderCommandUsage } from "./catalog.js";
import {
  parseCommandArgs,
  requireArg,
  usage,
} from "./framework.js";

const READ_USAGE = renderCommandUsage(["channels", "read"]);
const SEARCH_USAGE = renderCommandUsage(["channels", "search"]);
const SHOW_USAGE = renderCommandUsage(["channels", "show"]);
const TAIL_USAGE = renderCommandUsage(["channels", "tail"]);

function parseLimit(argv: string[]): number {
  const limitIdx = argv.indexOf("--limit");
  if (limitIdx === -1) return 20;

  const raw = argv[limitIdx + 1];
  if (!raw) {
    usage(READ_USAGE, "--limit value required");
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid --limit value: ${raw}`);
  }

  return parsed;
}

function parseSearchLimit(raw: string | undefined): number {
  if (!raw) return 50;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid --limit value: ${raw}`);
  }
  return parsed;
}

function asStringList(value: string | string[] | undefined): string[] {
  const values = Array.isArray(value)
    ? value
    : value === undefined
    ? []
    : [value];
  return values.flatMap((item) =>
    item.split(",").map((part) => part.trim()).filter(Boolean)
  );
}

function normalizeKind(value: string): ChannelMessageKind {
  const normalized = value.toLowerCase().replace(/-/g, "_");
  if ((CHANNEL_MESSAGE_KINDS as readonly string[]).includes(normalized)) {
    return normalized as ChannelMessageKind;
  }
  throw new Error(
    `invalid --kind value: ${value} (expected ${CHANNEL_MESSAGE_KINDS.join(", ")})`,
  );
}

function parseSearchArgs(args: string[]): {
  channel: string;
  filters: ChannelSearchFilters;
} {
  const parsed = parseCommandArgs({
    args,
    allowPositionals: true,
    usage: SEARCH_USAGE,
    options: {
      text: { type: "string" },
      kind: { type: "string", multiple: true },
      sender: { type: "string", multiple: true },
      "actor-id": { type: "string", multiple: true },
      transport: { type: "string", multiple: true },
      "content-type": { type: "string", multiple: true },
      addressed: { type: "string", multiple: true },
      watch: { type: "string", multiple: true },
      "source-kind": { type: "string", multiple: true },
      limit: { type: "string" },
    },
  });

  const channel = requireArg(parsed.positionals[0], SEARCH_USAGE, "channel");
  const query = parsed.values.text ?? parsed.positionals.slice(1).join(" ").trim();
  return {
    channel,
    filters: {
      ...(query ? { text: query } : {}),
      kinds: asStringList(parsed.values.kind).map(normalizeKind),
      senderKinds: asStringList(parsed.values.sender).map((value) => {
        const normalized = value.toLowerCase();
        if (normalized === "human" || normalized === "agent" || normalized === "system") {
          return normalized;
        }
        throw new Error("invalid --sender value: " + value);
      }),
      actorIds: asStringList(parsed.values["actor-id"]),
      transports: asStringList(parsed.values.transport),
      contentTypes: asStringList(parsed.values["content-type"]),
      addressedAgentIds: asStringList(parsed.values.addressed),
      watchIds: asStringList(parsed.values.watch),
      sourceKinds: asStringList(parsed.values["source-kind"]).map((value) =>
        value.toLowerCase().replace(/-/g, "_")
      ),
      limit: parseSearchLimit(parsed.values.limit),
    },
  };
}

function formatInspectionLine(message: ChannelMessageInspection): string {
  const ts = new Date(message.timestamp).toISOString();
  const senderName = message.sender.displayName ?? message.sender.actorId;
  const sourceId = message.source.id ? ` id=${message.source.id}` : "";
  const runId = message.source.runId ? ` run=${message.source.runId}` : "";
  const addressed = message.origin.addressedAgentId
    ? ` addressed=${message.origin.addressedAgentId}`
    : "";
  return `${dim(ts)}  ${accent(message.kind)}  ${message.sender.kind}:${senderName}  ${message.preview}${dim(`${sourceId}${runId}${addressed}`)}`;
}

function printInspectionDetails(message: ChannelMessageInspection): void {
  const sourceParts = [
    `transport=${message.source.transport}`,
    message.source.sourceChannel ? `channel=${message.source.sourceChannel}` : undefined,
    message.source.targetChannel ? `target=${message.source.targetChannel}` : undefined,
  ].filter((part): part is string => Boolean(part));
  if (sourceParts.length > 0) {
    console.log(`  ${label("source:")} ${sourceParts.join(" ")}`);
  }
  for (const command of message.source.inspectCommands) {
    console.log(`  ${label("inspect:")} ${command}`);
  }
}

export async function cmdChannelsList(
  runtime: AppRuntime,
  json: boolean,
): Promise<number> {
  const summaries = listChannelSummaries(runtime);
  if (summaries.length === 0) {
    console.log(dim("(no channels)"));
    return 0;
  }

  if (json) {
    console.log(JSON.stringify(summaries, null, 2));
    return 0;
  }

  for (const summary of summaries) {
    const age = summary.exists ? timeSince(statSync(summary.path).mtimeMs) : "-";
    const agentCount = formatChannelAgentIds(summary.membership).length;
    console.log(
      `${accent(summary.channel)}  ${summary.messageCount} msgs  ${age}  ${dim(`agents=${agentCount}`)}`,
    );
  }

  return 0;
}

export async function cmdChannelsShow(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const name = requireArg(args[0], SHOW_USAGE, "channel");

  const summary = summarizeChannel(runtime, name);
  if (!summary.exists && formatChannelAgentIds(summary.membership).length === 0) {
    throw new Error(`channel not found: ${name}`);
  }

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }

  console.log(`${label("channel:")} ${accent(summary.channel)}`);
  console.log(`${label("path:")} ${summary.path}`);
  console.log(`${label("exists:")} ${summary.exists}`);
  console.log(`${label("messages:")} ${summary.messageCount}`);
  const agentList = formatChannelAgentIds(summary.membership).join(", ");
  console.log(`${label("agents:")} ${agentList || dim("(none)")}`);
  const kindCounts = Object.entries(summary.activity.kindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind}=${count}`)
    .join(" ");
  console.log(`${label("message_kinds:")} ${kindCounts || dim("(none)")}`);
  if (summary.lastMessage) {
    console.log(`${label("last_message_at:")} ${new Date(summary.lastMessage.timestamp).toISOString()}`);
    console.log(
      `${label("last_message:")} ${summary.lastMessage.sender.kind}:${summary.lastMessage.sender.actorId} ${summary.lastMessage.preview}`,
    );
  } else {
    console.log(`${label("last_message:")} ${dim("(none)")}`);
  }
  if (summary.activity.recentRequests.length > 0) {
    console.log(`${label("recent_requests:")}`);
    for (const message of summary.activity.recentRequests) {
      console.log(`  ${formatInspectionLine(message)}`);
    }
  } else {
    console.log(`${label("recent_requests:")} ${dim("(none)")}`);
  }
  if (summary.activity.sourceRecords.length > 0) {
    console.log(`${label("source_records:")}`);
    for (const record of summary.activity.sourceRecords) {
      const run = record.runId ? ` run=${record.runId}` : "";
      const target = record.targetChannel ? ` target=${record.targetChannel}` : "";
      console.log(`  ${record.kind} id=${record.id}${run}${target} message=${record.messageId}`);
      for (const command of record.inspectCommands) {
        console.log(`    ${label("inspect:")} ${command}`);
      }
    }
  } else {
    console.log(`${label("source_records:")} ${dim("(none)")}`);
  }
  return 0;
}

export async function cmdChannelsRead(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const name = requireArg(args[0], READ_USAGE, "channel");

  const limit = parseLimit(args);
  const recent = readRecentChannelMessages(runtime, name, limit);
  if (json) {
    console.log(JSON.stringify(recent, null, 2));
    return 0;
  }

  for (const msg of recent) {
    printChannelLogMessage(msg);
  }

  return 0;
}

export async function cmdChannelsSearch(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const { channel, filters } = parseSearchArgs(args);
  const result = searchChannelMessages(runtime, channel, filters);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  console.log(
    `${label("channel:")} ${accent(result.channel)}  ${result.matchedCount}/${result.totalMessages} matches  ${dim(`showing=${result.returnedCount}`)}`,
  );
  if (result.messages.length === 0) {
    console.log(dim("(no matches)"));
    return 0;
  }
  for (const message of result.messages) {
    console.log(formatInspectionLine(message));
    printInspectionDetails(message);
  }

  return 0;
}

export async function cmdChannelsTail(
  channelBus: ChannelBus,
  args: string[],
): Promise<number> {
  const name = requireArg(args[0], TAIL_USAGE, "channel");

  const path = channelBus.path(name);

  if (existsSync(path)) {
    const { messages } = channelBus.read(name);
    for (const msg of messages.slice(-5)) {
      printChannelLogMessage(msg);
    }
  }

  console.log("--- watching ---");
  const watcher = channelBus.watch(
    (channel, messages) => {
      if (channel !== name) return;
      for (const msg of messages) {
        printChannelLogMessage(msg);
      }
    },
    existsSync(path)
      ? { [name]: { byteOffset: statSync(path).size } }
      : {},
  );

  await new Promise<void>((resolve) => {
    const onSigInt = () => {
      process.off("SIGINT", onSigInt);
      watcher.stop();
      resolve();
    };
    process.on("SIGINT", onSigInt);
  });

  return 0;
}
