import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import type { Watches } from "../watches/durable.ts";
import type { ChatToolsOptions } from "./options.ts";
import { postTool } from "./post.durable.ts";
import { threadTool } from "./thread.durable.ts";

/**
 * Shrimpy's chat tools (`post` and `thread`), installed as one extension.
 */
export function chatTools(options: ChatToolsOptions, watches: Watches): Extension {
  return defineExtension({ name: "chat-tools", tools: [postTool(options, watches), threadTool(options, watches)] });
}

export type { ChatToolsOptions } from "./options.ts";
export { reactorNames, resolveChannel, resolveThread, type ResolvedThread, type Unusable } from "./place.durable.ts";
