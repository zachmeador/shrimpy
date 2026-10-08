import type { AgentCommand, Channel, ChatClient, ChatEvent, Member } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Admissions } from "./admissions.ts";

/**
 * What the agent does for each command a person can write in a thread, with no
 * model call. The commands are the chat contract's, which clients show, so a
 * command added there is not built until it has an action here. A command is a
 * message whose text, after any mentions at its start, begins with a slash and
 * the name of one of these as a whole word.
 */
const ACTIONS: Record<AgentCommand, (admissions: Admissions, event: ChatEvent) => Promise<void>> = {
  stop: (admissions, event) => admissions.stopWork(event.message.threadId),
};

const isCommand = (word: string): word is AgentCommand => Object.hasOwn(ACTIONS, word);

/** Mentions may come first, as in `@scout /stop`. What follows the word is not part of the command. */
const COMMAND = /^\s*(?:@\S+\s+)*\/([\p{L}\p{N}_-]+)/u;

/**
 * The command a message of a thread is, if it is one that is for the agent: a
 * person wrote it, and it is in a DM, or it is in a room and mentions the agent,
 * says `@all`, or mentions nobody, which is for everyone there. What an agent
 * writes is only text, since an agent has no say over another agent's work.
 */
export function commandFor(self: Member, event: ChatEvent, where: Channel["kind"]): AgentCommand | undefined {
  if (event.kind !== "posted" || event.actor.kind !== "person") return undefined;
  const { mentions } = event.message;
  if (where === "room" && mentions.length > 0 && !mentions.includes(self.id)) return undefined;
  const word = COMMAND.exec(event.text)?.[1]?.toLowerCase();
  return word !== undefined && isCommand(word) ? word : undefined;
}

/** What acting on a command needs, apart from the command. */
export interface Obeying {
  chat: ChatClient;
  admissions: Admissions;
  signal: AbortSignal;
  /** Told when chat refuses the receipt, which is then not left. */
  onError: (error: Error) => void;
}

/**
 * Act on a command now, ahead of anything queued, and leave its receipt. The
 * receipt is `silent`: the agent dealt with the message and wrote nothing. It
 * comes after the work, so an agent that goes down in between reads the command
 * again and does the work again, and stopping twice stops once.
 */
export async function obey(command: AgentCommand, event: ChatEvent, { chat, admissions, signal, onError }: Obeying): Promise<void> {
  await ACTIONS[command](admissions, event);
  try {
    await chat.leaveReceipt([event.id], { status: "silent", reply: null, detail: null }, signal);
  } catch (error) {
    // Chat says no for good: reading the command again would only be refused again.
    if (!isRefusal(error)) throw error;
    onError(new Error(`Chat refused the receipt on the command ${event.id}, so it was dropped: ${error.message}`));
  }
}
