/**
 * The message tools: `send_message`, which posts to a thread or to the agent's
 * DM with someone right away, and `read_messages`, which reads one. They reach
 * chat over the connection the agent already has, handed to them, and never
 * open another or wait for one to come back. They must not know how chat is
 * found or kept, how a turn's reply is posted, or what the sessions store.
 */
import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import type { MessageToolsOptions } from "./options.ts";
import { readMessages } from "./read.ts";
import { sendMessage } from "./send.ts";

export type { MessageToolsOptions } from "./options.ts";

/** The message tools as an extension to install in the engine's registry. */
export function messageTools(options: MessageToolsOptions): Extension {
  return defineExtension({ name: "message-tools", tools: [sendMessage(options), readMessages(options)] });
}
