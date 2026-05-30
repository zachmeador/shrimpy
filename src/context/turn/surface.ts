import type { UnsupportedSurfaceMessage } from "../../channels/index.js";

export type { UnsupportedSurfaceMessage };

export function renderUnsupportedSurfaceMessage(
  message: UnsupportedSurfaceMessage,
): string {
  if (message.mediaKind === "other" && message.caption) {
    return message.caption;
  }
  const label = renderUnsupportedSurfaceLabel(message);
  return `${label}${renderCaption(message.caption)}`;
}

function renderUnsupportedSurfaceLabel(message: UnsupportedSurfaceMessage): string {
  switch (message.mediaKind) {
    case "document":
      return `[Document: ${message.fileName ?? "unsupported"}]`;
    case "voice":
      return "[Voice message: unsupported]";
    case "audio":
      return "[Audio: unsupported]";
    case "video":
      return "[Video: unsupported]";
    case "animation":
      return "[Animation: unsupported]";
    case "sticker":
      return "[Sticker: unsupported]";
    case "photo":
      return "[Photo: download failed]";
    case "photo_group":
      return "[Photo group: download failed]";
    case "location":
      return `[Location: ${message.latitude}, ${message.longitude}]`;
    case "contact": {
      const lastName = message.lastName ? ` ${message.lastName}` : "";
      return `[Contact: ${message.firstName ?? ""}${lastName}, ${message.phoneNumber ?? ""}]`;
    }
    case "other":
      return message.caption ?? "[Message: unsupported]";
  }
}

function renderCaption(caption?: string): string {
  return caption ? `\n${caption}` : "";
}
