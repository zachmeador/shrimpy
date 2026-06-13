import { accent, dim } from "../util/style.js";
import { formatAgeShort } from "../util/time-format.js";
import {
  readSessionResetContent,
  type MessageContent,
  type ChannelMessage,
} from "./index.js";

export const DEFAULT_CHANNEL_BODY_PREVIEW_CHARS = 360;

type PrintableChannelMessage = Pick<
  ChannelMessage,
  "sender" | "content" | "timestamp"
>;

interface ChannelMessageBodyOptions {
  full?: boolean;
  maxChars?: number;
}

export function timeSince(ms: number): string {
  return `${formatAgeShort(Date.now() - ms)} ago`;
}

export function formatChannelMessageBody(content: MessageContent): string {
  const reset = readSessionResetContent(content);
  return content.type === "text"
    ? content.data.text
    : reset
    ? `[session reset for ${reset.targetAgentId}]`
    : content.type === "control"
    ? `[control: ${content.data.kind}] ${JSON.stringify(content.data)}`
    : content.type === "status"
    ? `[status: ${content.data.kind}] ${JSON.stringify(content.data)}`
    : `[${content.type}] ${JSON.stringify(content.data)}`;
}

export function clipChannelMessageBody(
  text: string,
  maxChars = DEFAULT_CHANNEL_BODY_PREVIEW_CHARS,
): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trimEnd()} ... [truncated; use --full]`;
}

export function formatChannelMessageBodyPreview(
  content: MessageContent,
  opts: ChannelMessageBodyOptions = {},
): string {
  const body = formatChannelMessageBody(content);
  return opts.full
    ? body
    : clipChannelMessageBody(
      body,
      opts.maxChars ?? DEFAULT_CHANNEL_BODY_PREVIEW_CHARS,
    );
}

export function formatChannelLogMessage(
  msg: PrintableChannelMessage,
  opts: ChannelMessageBodyOptions = {},
): string {
  const ts = new Date(msg.timestamp).toLocaleTimeString();
  const text = formatChannelMessageBodyPreview(msg.content, {
    full: opts.full ?? true,
    maxChars: opts.maxChars,
  });
  const senderName = msg.sender.displayName ?? msg.sender.actorId;
  const sender = `${dim(`${msg.sender.kind}:`)}${accent(senderName)}`;

  return `${dim(ts)}  ${sender}  ${text}`;
}

export function printChannelLogMessage(
  msg: PrintableChannelMessage,
  opts: ChannelMessageBodyOptions = {},
): void {
  console.log(formatChannelLogMessage(msg, opts));
}
