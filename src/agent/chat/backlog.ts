import type { Channel, ChatClient, Member, Message } from "../../contracts/chat/index.ts";
import { type Backlog, type Said, written } from "../inputs/index.ts";
import { audienceOf } from "./audience.ts";
import { clip } from "./reply.ts";

/** Characters of messages the model is shown of what it missed. */
export const BACKLOG_BUDGET = 20_000;

/** Messages asked for at a time. */
const PAGE = 200;
/** The blank line between two messages as the model reads them. */
const BETWEEN = 2;
/** A message cut to fewer characters than this is not worth showing: it is counted among the ones that are cut. */
const LEAST_CLIPPED = 200;

/**
 * The messages of a thread that the agent has not looked at, which come before
 * the event that woke it: the newest page of them, and whether there may be
 * more beyond the page. The agent's own messages and ones taken back are left
 * out, since neither tells it anything, and so is `except`, a message that the
 * event itself is about and shows.
 */
export async function readUnseen(options: {
  chat: ChatClient;
  self: Member;
  threadId: string;
  /** The position of the event: only what came before it is read. */
  before: number;
  /** Where the agent last looked, or undefined if it never has. */
  since: number | undefined;
  except: string;
  signal: AbortSignal;
}): Promise<{ unseen: Message[]; more: boolean }> {
  const { chat, self, threadId, before, since, except, signal } = options;
  const isUnseen = (message: Message): boolean => since === undefined || message.seq > since;
  const page = await chat.read(threadId, before, PAGE, signal);
  const unseen = page.filter((message) => isUnseen(message) && message.author.id !== self.id && !message.deleted && message.id !== except);

  // The page is the newest messages. Whether more of what is unseen lies beyond it takes one look at what is just before it.
  const oldest = page[0];
  if (oldest === undefined || !isUnseen(oldest)) return { unseen, more: false };
  const [older] = await chat.read(threadId, oldest.seq, 1, signal);
  return { unseen, more: older !== undefined && isUnseen(older) };
}

/**
 * What the model is shown of `unseen`, oldest first: as many of the newest, in
 * whole, as fit in the budget, and then the next one cut short if there is room
 * for enough of it to be worth showing. What is left out is counted. `more` says
 * there were messages beyond the ones read, so the count is a least.
 */
export function backlogOf(unseen: readonly Message[], more: boolean, self: Member, room: Channel): Backlog {
  const messages = unseen.map((message) => said(message, self, room));
  const shown: Said[] = [];
  let left = BACKLOG_BUDGET;
  let index = messages.length;
  while (index > 0) {
    const message = messages[index - 1];
    if (message === undefined) break;
    const size = written(message).length + BETWEEN;
    if (size <= left) {
      shown.unshift(message);
      left -= size;
      index -= 1;
      continue;
    }
    const clipped = clippedTo(message, left);
    if (clipped !== undefined) {
      shown.unshift(clipped);
      index -= 1;
    }
    break;
  }
  return { messages: shown, cut: index + (more ? 1 : 0), ...(more ? { atLeast: true as const } : {}) };
}

/** A message as the model reads one that arrives: with who it was for, and when it was edited if it was. */
function said(message: Message, self: Member, room: Channel): Said {
  return {
    kind: "posted",
    id: message.event,
    seq: message.seq,
    author: message.author.name,
    sentAt: message.sentAt,
    text: message.text,
    to: audienceOf(self, message.author, message.mentions, room),
    ...(message.editedAt === null ? {} : { editedAt: message.editedAt }),
  };
}

/** The start of the message that fits in `left` characters with what says it was cut, or undefined when too little would be left of it. */
function clippedTo(message: Said, left: number): Said | undefined {
  const marked: Said = { ...message, text: "", clipped: true };
  const room = left - written(marked).length - BETWEEN;
  return room < LEAST_CLIPPED ? undefined : { ...marked, text: clip(message.text, room) };
}
