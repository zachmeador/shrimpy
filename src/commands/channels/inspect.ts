import { existsSync, statSync } from "node:fs";
import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelBus } from "../../channels/bus.js";
import {
  DEFAULT_CHANNEL_BODY_PREVIEW_CHARS,
  printChannelLogMessage,
  timeSince,
} from "../../channels/format.js";
import { formatTransportBinding } from "../../channels/manifest.js";
import { channelAgentIds } from "../../channels/membership.js";
import {
  CHANNEL_MESSAGE_KINDS,
  listChannelSummaries,
  readRecentChannelMessages,
  searchChannelMessages,
  summarizeChannel,
  type ChannelMessageInspection,
  type ChannelMessageKind,
  type ChannelSearchFilters,
} from "../../channels/inspection.js";
import { parsePositiveInt } from "../../util/parse.js";
import { accent, dim, label } from "../../util/style.js";
import { renderCommandUsage } from "../catalog.js";
import {
  parseCommandArgs,
  requireArg,
} from "../framework.js";

const READ_USAGE = renderCommandUsage(["channels", "read"]);
const SEARCH_USAGE = renderCommandUsage(["channels", "search"]);
const SHOW_USAGE = renderCommandUsage(["channels", "show"]);
const TAIL_USAGE = renderCommandUsage(["channels", "tail"]);

function parseSearchLimit(raw: string | undefined): number {
  if (!raw) return 50;
  return parsePositiveInt(raw, "--limit");
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
  full: boolean;
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
      full: { type: "boolean", default: false },
    },
  });

  const channel = requireArg(parsed.positionals[0], SEARCH_USAGE, "channel");
  const query = parsed.values.text ?? parsed.positionals.slice(1).join(" ").trim();
  return {
    channel,
    full: Boolean(parsed.values.full),
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

function parseReadArgs(args: string[]): {
  channel: string;
  limit: number;
  full: boolean;
} {
  const parsed = parseCommandArgs({
    args,
    allowPositionals: true,
    strict: true,
    usage: READ_USAGE,
    options: {
      limit: { type: "string", default: "20" },
      full: { type: "boolean", default: false },
    },
  });
  return {
    channel: requireArg(parsed.positionals[0], READ_USAGE, "channel"),
    limit: parsePositiveInt(String(parsed.values.limit), "--limit"),
    full: Boolean(parsed.values.full),
  };
}

function formatInspectionLine(message: ChannelMessageInspection): string {
  const ts = new Date(message.timestamp).toISOString();
  const senderName = message.sender.displayName ?? message.sender.actorId;
  const sourceId = message.sourceId ? ` id=${message.sourceId}` : "";
  const runId = message.origin.runId ? ` run=${message.origin.runId}` : "";
  const addressed = message.origin.addressedAgentId
    ? ` addressed=${message.origin.addressedAgentId}`
    : "";
  return `${dim(ts)}  ${accent(message.kind)}  ${message.sender.kind}:${senderName}  ${message.preview}${dim(`${sourceId}${runId}${addressed}`)}`;
}

function printInspectionDetails(message: ChannelMessageInspection): void {
  const sourceParts = [
    `transport=${message.origin.transport}`,
    message.origin.sourceChannel ? `channel=${message.origin.sourceChannel}` : undefined,
    message.targetChannel ? `target=${message.targetChannel}` : undefined,
  ].filter((part): part is string => Boolean(part));
  if (sourceParts.length > 0) {
    console.log(`  ${label("source:")} ${sourceParts.join(" ")}`);
  }
  for (const command of message.inspectCommands) {
    console.log(`  ${label("inspect:")} ${command}`);
  }
}

export async function cmdChannelsList(
  runtime: AppRuntime,
  json: boolean,
): Promise<number> {
  const summaries = listChannelSummaries(runtime, { includeActivity: false });
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
    const agentCount = channelAgentIds(summary.membership).length;
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
  if (!summary.exists && channelAgentIds(summary.membership).length === 0) {
    throw new Error(`channel not found: ${name}`);
  }

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
    return 0;
  }

  console.log(`${label("channel:")} ${accent(summary.channel)}`);
  console.log(`${label("path:")} ${summary.path}`);
  console.log(`${label("exists:")} ${summary.exists}`);
  console.log(`${label("kind:")} ${summary.manifest.kind}`);
  console.log(`${label("binding:")} ${formatTransportBinding(summary.manifest.binding)}`);
  console.log(`${label("messages:")} ${summary.messageCount}`);
  console.log(`${label("undelivered:")} ${summary.deliveries.undelivered}`);
  if (summary.deliveries.lastReceipt) {
    const receipt = summary.deliveries.lastReceipt;
    console.log(
      `${label("last_delivery:")} ${receipt.status} attempts=${receipt.attempts}${receipt.error ? ` error=${receipt.error}` : ""}`,
    );
  }
  const agentList = channelAgentIds(summary.membership).join(", ");
  console.log(`${label("agents:")} ${agentList || dim("(none)")}`);
  const activity = summary.activity;
  const kindCounts = activity
    ? Object.entries(activity.kindCounts)
      .filter(([, count]) => count > 0)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(" ")
    : "";
  console.log(`${label("message_kinds:")} ${kindCounts || dim("(none)")}`);
  if (summary.lastMessage) {
    console.log(`${label("last_message_at:")} ${new Date(summary.lastMessage.timestamp).toISOString()}`);
    console.log(
      `${label("last_message:")} ${summary.lastMessage.sender.kind}:${summary.lastMessage.sender.actorId} ${summary.lastMessage.preview}`,
    );
  } else {
    console.log(`${label("last_message:")} ${dim("(none)")}`);
  }
  if (activity && activity.recentRequests.length > 0) {
    console.log(`${label("recent_requests:")}`);
    for (const message of activity.recentRequests) {
      console.log(`  ${formatInspectionLine(message)}`);
    }
  } else {
    console.log(`${label("recent_requests:")} ${dim("(none)")}`);
  }
  if (activity && activity.sourceRecords.length > 0) {
    console.log(`${label("source_records:")}`);
    for (const record of activity.sourceRecords) {
      const run = record.origin.runId ? ` run=${record.origin.runId}` : "";
      const target = record.targetChannel ? ` target=${record.targetChannel}` : "";
      console.log(`  ${record.kind} id=${record.sourceId}${run}${target} message=${record.id}`);
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
  const { channel, limit, full } = parseReadArgs(args);
  const recent = readRecentChannelMessages(runtime, channel, limit);
  if (json) {
    console.log(JSON.stringify(recent, null, 2));
    return 0;
  }

  for (const msg of recent) {
    printChannelLogMessage(msg, {
      full,
      maxChars: DEFAULT_CHANNEL_BODY_PREVIEW_CHARS,
    });
  }

  return 0;
}

export async function cmdChannelsSearch(
  runtime: AppRuntime,
  args: string[],
  json: boolean,
): Promise<number> {
  const { channel, filters, full } = parseSearchArgs(args);
  const result = searchChannelMessages(
    runtime,
    channel,
    filters,
    json
      ? {}
      : {
        fullPreview: full,
        previewChars: DEFAULT_CHANNEL_BODY_PREVIEW_CHARS,
      },
  );
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
