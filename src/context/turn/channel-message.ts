import type { ChannelMessage } from "../../channels/index.js";
import { renderUnsupportedSurfaceMessage } from "./surface.js";

export function formatChannelMessage(
  channel: string,
  msg: ChannelMessage,
): string {
  const senderLabel = msg.sender.displayName
    ? `${msg.sender.kind}:${msg.sender.displayName}`
    : `${msg.sender.kind}:${msg.sender.actorId}`;
  const addressed = msg.origin.addressedAgentId
    ? `, addressed_agent: ${msg.origin.addressedAgentId}`
    : "";
  const header = `[channel: ${channel}, sender: ${senderLabel}${addressed}]`;

  switch (msg.content.type) {
    case "text":
      return `${header}\n${msg.content.data.text}`;

    case "image": {
      const parts = [header];
      parts.push(`[Image: ${msg.content.data.path}]`);
      if (typeof msg.content.data.caption === "string") {
        parts.push(msg.content.data.caption);
      }
      return parts.join("\n");
    }

    case "image_group": {
      const parts = [header];
      for (const path of msg.content.data.paths) {
        parts.push(`[Image: ${path}]`);
      }
      if (typeof msg.content.data.caption === "string") {
        parts.push(msg.content.data.caption);
      }
      return parts.join("\n");
    }

    case "unsupported_media":
      return `${header}\n${renderUnsupportedSurfaceMessage(msg.content.data)}`;

    case "system":
      return `${header}\n[System: ${JSON.stringify(msg.content.data)}]`;
  }
}
