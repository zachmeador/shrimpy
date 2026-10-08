import {
  AGENT_COMMANDS,
  type AgentCommand,
  agentCommandIn,
  type Channel,
  type ChatClient,
  type ChatEvent,
  MAX_RECEIPT_DETAIL_LENGTH,
  type Member,
  type Receipt,
} from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Admissions } from "./admissions.ts";
import { actOnModel } from "./model-command.ts";
import { clip, commandReplyRequestId } from "./reply.ts";

/**
 * What the agent does for each command a person can write in a thread, with no
 * model call, and the one line it says in the thread about it, if it says one.
 * The commands are the chat contract's, which clients show, so a command added
 * there is not built until it has an action here. A command is a message whose
 * text, after any mentions at its start, begins with a slash and the name of one
 * of these as a whole word; `words` is what follows the name.
 */
const ACTIONS: Record<AgentCommand, (admissions: Admissions, event: ChatEvent, words: string) => Promise<string | undefined>> = {
  stop: async (admissions, event) => {
    await admissions.stopWork(event.message.threadId);
    return undefined;
  },
  model: (admissions, { message }, words) => actOnModel(admissions, message, words),
};

/**
 * The command a message of a thread is, if it is one that is for the agent: a
 * person wrote it, and it is in a DM, or it is in a room and mentions the agent
 * or says `@all`, or mentions nobody and is a command that is then for everyone
 * there, as the chat contract says of each. What an agent writes is only text,
 * since an agent has no say over another agent's work.
 */
export function commandFor(self: Member, event: ChatEvent, where: Channel["kind"]): AgentCommand | undefined {
  if (event.kind !== "posted" || event.actor.kind !== "person") return undefined;
  const name = agentCommandIn(event.text)?.command;
  if (name === undefined) return undefined;
  if (where === "room") {
    const { mentions } = event.message;
    const forMe = mentions.length === 0 ? AGENT_COMMANDS[name].withoutMention === "everyone" : mentions.includes(self.id);
    if (!forMe) return undefined;
  }
  return name;
}

/** What acting on a command needs, apart from the command. */
export interface Obeying {
  chat: ChatClient;
  admissions: Admissions;
  signal: AbortSignal;
  /** Told when chat refuses the receipt or the line, which is then not left or posted. */
  onError: (error: Error) => void;
}

/** What an agent's receipt says: `Receipt` without the member who left it and the event it is left on. */
type Left = Omit<Receipt, "memberId" | "event">;

/**
 * Act on a command now, ahead of anything queued, say the one line it has in the
 * thread if it has one, and leave its receipt, which points at that line, or is
 * `silent` for a command that says nothing. The receipt comes after the work and
 * the line, so an agent that goes down in between reads the command again and
 * does the work again, and stopping twice stops once. The line is named for the
 * command's event and for what it says, so posting it again posts nothing twice.
 */
export async function obey(command: AgentCommand, event: ChatEvent, { chat, admissions, signal, onError }: Obeying): Promise<void> {
  const words = (event.kind === "posted" ? agentCommandIn(event.text)?.words : undefined) ?? "";
  const line = await ACTIONS[command](admissions, event, words);
  let receipt: Left = { status: "silent", reply: null, detail: null };
  if (line !== undefined) {
    try {
      const posted = await chat.post(event.message.threadId, line, commandReplyRequestId(event.id, line), signal);
      receipt = { status: "answered", reply: posted.id, detail: null };
    } catch (error) {
      if (!isRefusal(error)) throw error;
      onError(new Error(`Chat refused the reply to the command ${event.id}, so its receipt says it failed: ${error.message}`));
      receipt = { status: "failed", reply: null, detail: clip(`The reply could not be posted: ${error.message}`, MAX_RECEIPT_DETAIL_LENGTH) };
    }
  }
  try {
    await chat.leaveReceipt([event.id], receipt, signal);
  } catch (error) {
    // Chat says no for good: reading the command again would only be refused again.
    if (!isRefusal(error)) throw error;
    onError(new Error(`Chat refused the receipt on the command ${event.id}, so it was dropped: ${error.message}`));
  }
}
