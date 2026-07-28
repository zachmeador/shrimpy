export type NodeDescriptor =
  | { type: "overview" }
  | { type: "agent"; agentId: string }
  | { type: "agent-file"; agentId: string; path: string }
  | { type: "watch"; agentId: string }
  | { type: "channel"; channel: string }
  | {
      type: "session";
      agentId: string;
      namespace: string;
      nameDirectory: string;
      profileDirectory: string;
      file: string;
    }
  | { type: "runtime"; path: string }
  | { type: "file"; path: string };

export function encodeNodeId(descriptor: NodeDescriptor): string {
  return Buffer.from(JSON.stringify(descriptor), "utf8").toString("base64url");
}

export function decodeNodeId(id: string): NodeDescriptor | null {
  try {
    const value = JSON.parse(
      Buffer.from(id, "base64url").toString("utf8"),
    ) as unknown;
    if (!isRecord(value) || typeof value.type !== "string") return null;
    switch (value.type) {
      case "overview":
        return { type: "overview" };
      case "agent":
      case "watch":
        return typeof value.agentId === "string"
          ? { type: value.type, agentId: value.agentId }
          : null;
      case "agent-file":
        return typeof value.agentId === "string"
          && typeof value.path === "string"
          ? {
              type: "agent-file",
              agentId: value.agentId,
              path: value.path,
            }
          : null;
      case "channel":
        return typeof value.channel === "string"
          ? { type: "channel", channel: value.channel }
          : null;
      case "runtime":
      case "file":
        return typeof value.path === "string"
          ? { type: value.type, path: value.path }
          : null;
      case "session":
        return [
          value.agentId,
          value.namespace,
          value.nameDirectory,
          value.profileDirectory,
          value.file,
        ].every((item) => typeof item === "string")
          ? value as NodeDescriptor
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
