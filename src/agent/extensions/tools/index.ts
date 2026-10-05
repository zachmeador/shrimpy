/**
 * The agent's own tools. The message tools: `send_message`, which posts to a
 * thread or to the agent's DM with someone right away, and `read_messages`,
 * which reads one. They reach chat over the connection the agent already has,
 * handed to them, and never open another or wait for one to come back. And
 * `check_back`, which wakes the session that calls it, once, later: it asks the
 * sessions to keep the wake-up and does not know how they do. They must not
 * know how chat is found or kept, how a turn's reply is posted, or what the
 * sessions store.
 */
import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import { checkBack } from "./check-back.ts";
import type { MessageToolsOptions, WakeupToolsOptions } from "./options.ts";
import { readMessages } from "./read.ts";
import { sendMessage } from "./send.ts";

export type { MessageToolsOptions, WakeupToolsOptions } from "./options.ts";

/** The message tools as an extension to install in the engine's registry. */
export function messageTools(options: MessageToolsOptions): Extension {
  return defineExtension({ name: "message-tools", tools: [sendMessage(options), readMessages(options)] });
}

/** The tool that wakes the calling session later, as an extension to install in the engine's registry. */
export function wakeupTools(options: WakeupToolsOptions): Extension {
  return defineExtension({ name: "wakeup-tools", tools: [checkBack(options)] });
}
