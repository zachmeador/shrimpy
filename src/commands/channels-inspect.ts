import { existsSync, statSync } from "node:fs";
import type { AppRuntime } from "../app/index.js";
import type { ChannelBus } from "../channels/bus.js";
import { printChannelLogMessage, timeSince } from "../channels/format.js";
import {
  formatChannelAgentIds,
  listChannelSummaries,
  readRecentChannelMessages,
  summarizeChannel,
} from "../channels/service.js";
import { accent, dim, label } from "../util/style.js";
import {
  requireArg,
  usage,
} from "./framework.js";

const READ_USAGE = "usage: shrimpy channels read <name> [--limit N]";
const SHOW_USAGE = "usage: shrimpy channels show <name> [--json]";
const TAIL_USAGE = "usage: shrimpy channels tail <name>";

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
  if (summary.lastMessage) {
    console.log(`${label("last_message_at:")} ${new Date(summary.lastMessage.timestamp).toISOString()}`);
    console.log(
      `${label("last_message:")} ${summary.lastMessage.sender.kind}:${summary.lastMessage.sender.actorId} ${summary.lastMessage.preview}`,
    );
  } else {
    console.log(`${label("last_message:")} ${dim("(none)")}`);
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
