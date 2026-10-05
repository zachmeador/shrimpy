import type { Channel, Message, Receipt, Thread } from "../../contracts/chat/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { indent } from "./render.ts";
import { renderTable } from "./table.ts";

/** What a member of the channel is called, for the IDs that threads and receipts carry. */
function namer(channel: Channel): (memberId: string) => string {
  const names = new Map(channel.members.map((member) => [member.id, member.name]));
  return (memberId) => names.get(memberId) ?? memberId;
}

/** A thread's name, or the start of its first message, or a word saying it is empty, with what kind of thread it is. */
function titleOf(thread: Thread): string {
  const title = thread.name ?? thread.preview ?? "(no messages yet)";
  const tags = [thread.main ? "main" : undefined, thread.archived ? "archived" : undefined].filter(
    (tag) => tag !== undefined,
  );
  return tags.length === 0 ? title : `${title} [${tags.join(", ")}]`;
}

/** The threads of a channel as a table: ID, when last updated, who is working in it now, and its name or preview. */
export function renderThreads(threads: Thread[], channel: Channel): string[] {
  const nameOf = namer(channel);
  const rows = threads.map((thread) => [
    thread.id,
    localTime(thread.updatedAt),
    thread.working.map((mark) => nameOf(mark.memberId)).join(", "),
    titleOf(thread),
  ]);
  return renderTable(["thread", "updated", "working", "name"], rows);
}

/**
 * A thread to read, with its messages as they now stand, oldest first: who said
 * what and when, and each message's ID. An edited message says when, a deleted
 * one says it was deleted, and the emoji on a message are listed with who put
 * them there. Below a message, a line for each agent that failed, stopped or
 * skipped it. An answer is the message that follows, and a silent receipt is
 * data nobody is shown, so neither gets a line. At the end, a line for each
 * member working in it now.
 */
export function renderThread(thread: Thread, messages: Message[], channel: Channel): string[] {
  const nameOf = namer(channel);
  const where = channel.kind === "dm" ? `your DM with ${channel.name}` : `the room #${channel.name}`;
  const lines = [`Thread ${thread.id} in ${where}: ${titleOf(thread)}`];
  if (messages.length === 0) lines.push("", "(no messages yet)");
  for (const message of messages) {
    const edited = message.editedAt === null || message.deleted ? "" : `  edited ${localTime(message.editedAt)}`;
    lines.push(
      "",
      `${message.author.name}  ${localTime(message.sentAt)}  ${message.id}${edited}`,
      ...indent(message.deleted ? "(deleted)" : message.text.trimEnd()),
    );
    if (message.reactions.length > 0) {
      const reactions = message.reactions.map((reaction) => `${reaction.emoji} ${reaction.memberIds.map(nameOf).join(", ")}`);
      lines.push(...indent(reactions.join("  ")));
    }
    for (const receipt of message.receipts) {
      const note = receiptNote(receipt, nameOf(receipt.memberId));
      if (note !== undefined) lines.push(note);
    }
  }
  for (const mark of thread.working) {
    lines.push("", `-- ${nameOf(mark.memberId)} is working (since ${localTime(mark.since)}) --`);
  }
  return lines;
}

function receiptNote(receipt: Receipt, who: string): string | undefined {
  switch (receipt.status) {
    case "answered":
    case "silent":
      return undefined;
    case "failed":
      return `-- ${who} failed: ${(receipt.detail ?? "").replace(/\s*\n\s*/g, " ")} --`;
    case "stopped":
      return `-- ${who} stopped before answering --`;
    case "skipped":
      return `-- ${who} skipped this message --`;
  }
}
