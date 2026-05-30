import { accent, dim } from "../util/style.js";
import {
  readSessionResetContent,
  type ChannelMessage,
} from "./index.js";

type PrintableChannelMessage = Pick<
  ChannelMessage,
  "sender" | "content" | "timestamp"
>;

export function timeSince(ms: number): string {
  const sec = Math.floor((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function formatChannelLogMessage(
  msg: PrintableChannelMessage,
): string {
  const ts = new Date(msg.timestamp).toLocaleTimeString();
  const reset = readSessionResetContent(msg.content);
  const text = msg.content.type === "text"
    ? msg.content.data.text
    : reset
    ? `[session reset for ${reset.targetAgentId}]`
    : `[${msg.content.type}] ${JSON.stringify(msg.content.data)}`;
  const senderName = msg.sender.displayName ?? msg.sender.actorId;
  const sender = `${dim(`${msg.sender.kind}:`)}${accent(senderName)}`;

  return `${dim(ts)}  ${sender}  ${text}`;
}

export function printChannelLogMessage(msg: PrintableChannelMessage): void {
  console.log(formatChannelLogMessage(msg));
}
