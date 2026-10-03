import { webSocketPath } from "../../contracts/gateway/index.ts";
import { startWeb, type WebEntry } from "../web/index.ts";

/** A browser entry that pipes `agent/<name>` to the socket given for `name`, and nothing else. */
export function openEntry(programs: Record<string, string>): Promise<WebEntry> {
  return startWeb({ port: 0 }, (target) =>
    target === "gateway" || target.kind !== "agent" ? undefined : programs[target.name],
  );
}

/** The WebSocket URL for the agent called `name` on the entry listening at `port`. */
export function agentUrl(port: number, name: string): string {
  return `ws://127.0.0.1:${port}${webSocketPath({ kind: "agent", name })}`;
}
