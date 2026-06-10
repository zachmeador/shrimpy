import { accent, dim } from "../util/style.js";
import { formatAgeShort } from "../util/time-format.js";
import {
  readSessionResetContent,
  type ChannelMessage,
} from "./index.js";

type PrintableChannelMessage = Pick<
  ChannelMessage,
  "sender" | "content" | "timestamp"
>;

export function timeSince(ms: number): string {
  return `${formatAgeShort(Date.now() - ms)} ago`;
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
    : msg.content.type === "control"
    ? `[control: ${msg.content.data.kind}] ${JSON.stringify(msg.content.data)}`
    : msg.content.type === "status"
    ? `[status: ${msg.content.data.kind}] ${JSON.stringify(msg.content.data)}`
    : `[${msg.content.type}] ${JSON.stringify(msg.content.data)}`;
  const senderName = msg.sender.displayName ?? msg.sender.actorId;
  const sender = `${dim(`${msg.sender.kind}:`)}${accent(senderName)}`;

  return `${dim(ts)}  ${sender}  ${text}`;
}

export function printChannelLogMessage(msg: PrintableChannelMessage): void {
  console.log(formatChannelLogMessage(msg));
}
