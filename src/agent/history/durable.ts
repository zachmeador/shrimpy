/**
 * History search and inspection for an agent: the `history` tool (searching and
 * reading pre-compaction session entries across the agent's own sessions and
 * chat messages across readable rooms and DMs) and the `beforeRequest` hook
 * that reminds the model of `history` after a compaction summary. It must not
 * know about clients, the gateway, or the CLI.
 */
import { defineExtension, type Extension, type Harness } from "@earendil-works/pi-durable";
import type { ChatToolsOptions } from "../chat-tools/durable.ts";
import { compactionNoteHook } from "./compaction-note.durable.ts";
import { historyTool } from "./history.durable.ts";

export { COMPACTION_REMINDER } from "./compaction-note.durable.ts";

/** Shrimpy's `history` tool and post-compaction recall reminder, installed as one extension. */
export function createHistory(harness: Harness, options: ChatToolsOptions): Extension {
  return defineExtension({
    name: "history",
    tools: [historyTool(harness, options)],
    hooks: [compactionNoteHook],
  });
}
