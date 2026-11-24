import {
  type Channel,
  channelLabel,
  firedWords,
  type Member,
  type Message,
  namer,
  NO_MESSAGES,
  receiptWords,
  taggedTitle,
  type Thread,
} from "../../contracts/chat/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { indent } from "./render.ts";
import { renderTable } from "./table.ts";

/** The threads of a channel as a table: ID, when last updated, who is working in it now, and its name or preview. */
export function renderThreads(threads: Thread[], channel: Channel): string[] {
  const nameOf = namer(channel.members);
  const rows = threads.map((thread) => [
    thread.id,
    localTime(thread.updatedAt),
    thread.working.map((mark) => nameOf(mark.memberId)).join(", "),
    taggedTitle(thread, channel.kind),
  ]);
  return renderTable(["thread", "updated", "working", "name"], rows);
}

/** What a message says as `read` prints it: its text, that it was deleted, or which trigger fired and when. */
function bodyOf(message: Message): string {
  if (message.trigger !== null) return firedWords(message.trigger.name, localTime(message.trigger.firedAt));
  return message.deleted ? "(deleted)" : message.text.trimEnd();
}

/**
 * A thread to read, with its messages as they now stand, oldest first: who said
 * what and when, and each message's ID. An edited message says when, a deleted
 * one says it was deleted, a trigger's line says which trigger fired and when,
 * and the emoji on a message are listed with who put them there. Below a
 * message, a line for each agent that failed, stopped or skipped it. An answer
 * is the message that follows, and a silent receipt is data nobody is shown, so
 * neither gets a line. At the end, a line for each member working in it now.
 */
export function renderThread(thread: Thread, messages: Message[], channel: Channel, you: Member): string[] {
  const nameOf = namer(channel.members);
  const lines = [`Thread ${thread.id} in ${channelLabel(channel, you.id)}: ${taggedTitle(thread, channel.kind)}`];
  if (messages.length === 0) lines.push("", NO_MESSAGES);
  for (const message of messages) {
    const edited = message.editedAt === null || message.deleted ? "" : `  edited ${localTime(message.editedAt)}`;
    lines.push(
      "",
      `${message.author.name}  ${localTime(message.sentAt)}  ${message.id}${edited}`,
      ...indent(bodyOf(message)),
    );
    if (message.reactions.length > 0) {
      const reactions = message.reactions.map((reaction) => `${reaction.emoji} ${reaction.memberIds.map(nameOf).join(", ")}`);
      lines.push(...indent(reactions.join("  ")));
    }
    for (const receipt of message.receipts) {
      const note = receiptWords(receipt, nameOf(receipt.memberId));
      if (note !== undefined) lines.push(`-- ${note} --`);
    }
  }
  for (const mark of thread.working) {
    lines.push("", `-- ${nameOf(mark.memberId)} is working (since ${localTime(mark.since)}) --`);
  }
  return lines;
}
