/**
 * The agent's message tools: `send_message`, which posts right away to a
 * thread, to a new thread of the agent's DM with someone or to a room it is in,
 * and `read_messages`, which reads one. They reach chat as the agent already
 * has it, handed to them, and never wait for it to come back. They must not know how chat is found or
 * kept, how a turn's reply is posted, or what the sessions store.
 */
import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import type { MessageToolsOptions } from "./options.ts";
import { readMessages } from "./read.durable.ts";
import { sendMessage } from "./send.durable.ts";

/** The message tools as an extension to install in the engine's registry. */
export function messageTools(options: MessageToolsOptions): Extension {
  return defineExtension({ name: "message-tools", tools: [sendMessage(options), readMessages(options)] });
}
