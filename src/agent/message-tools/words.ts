/*
 * Every sentence the model reads from the agent's own tools: what each tool is
 * for, what its arguments mean, and what it answers. Nothing else in this
 * module writes words for the model.
 */
import { roomLabel, taggedTitle, type Thread } from "../../contracts/chat/index.ts";

/** The argument that names a place: where `send_message` posts, and what `read_messages` reads. */
export type PlaceArgument = "to" | "from";

export const SEND_DESCRIPTION =
  "Post a message now, without ending your turn. Use it to tell someone something before you finish, or to " +
  "write somewhere other than this thread. What you write last is still posted as your reply, so don't use " +
  "this to answer.";
export const SEND_TEXT = "The message to post.";
export const SEND_TO =
  "Where to post it: @name to start a new thread with that person or agent, in your DM with them, which is started " +
  "if you have none; @name/thread for one of your threads with them; #room for the first pinned thread of a room you " +
  "are in; or #room/thread " +
  "for one of its threads. Give a thread by its ID or its name. Leave it out to post to this thread. Start a thread " +
  "only for something new, and make its first line say what it is about, since a thread is called by how it starts.";
export const SEND_QUIET =
  "true to post it without a notification on anyone's devices. It is still there to read. Use it for what can wait, " +
  "such as routine progress.";

export const READ_DESCRIPTION =
  "Read the newest messages of a thread, oldest first, as they stand now: edited ones say so, deleted ones " +
  "have lost their text, and reactions are listed. Use it to see what was said earlier, in this thread, " +
  "in another of your threads or in a room.";
export const READ_FROM =
  "Which thread to read: @name/thread for one of your threads with that person or agent; #room for the first pinned " +
  "thread of a room you are in; or #room/thread for one of its threads. Give a thread by its ID or its name. Leave it " +
  "out to read this thread. @name alone lists your threads with them.";
export const READ_LIMIT = "How many messages to read. 20 if you leave it out, and at most 100.";
export const READ_BEFORE =
  "A number from an earlier result: read only the messages before it. The result says which number to use.";

export const THIS_THREAD = "this thread";

export const dmWith = (name: string): string => `your DM with ${name}`;

export const newDmThread = (name: string, thread: string): string => `a new thread of your DM with ${name}, ${thread}`;

export const dmThreadLabel = (name: string, thread: string): string => `the thread ${thread} of your DM with ${name}`;

export const theRoom = (name: string): string => `the room ${roomLabel(name)}`;

export const roomThreadLabel = (thread: string, room: string): string => `the thread ${thread} of ${roomLabel(room)}`;

// Where a message goes or comes from, when that cannot be worked out.

export function badPlace(argument: PlaceArgument): string {
  if (argument === "to") {
    return (
      "to should be @name, such as @maya, the name of a person or an agent, to start a thread with them; " +
      "@name/thread for one of your threads with them; #room, such as #ops, for the first pinned thread of a room " +
      "you are in; or #room/thread for one of its threads. Leave it out to post to this thread."
    );
  }
  return (
    "from should be @name/thread for one of your threads with a person or an agent, by its ID or its name; #room, " +
    "such as #ops, for the first pinned thread of a room you are in; or #room/thread for one of its threads. Leave " +
    "it out to read this thread."
  );
}

/** Threads named in one list at most. The rest are counted. */
const MOST_LISTED = 20;

/** Threads as someone who has to pick one reads them: each by its ID and what it is called, the first `MOST_LISTED`, and how many more. */
function listOf(threads: readonly Thread[]): string {
  const named = threads.slice(0, MOST_LISTED).map((thread) => `${thread.id} (${taggedTitle(thread)})`);
  const rest = threads.length - named.length;
  return rest > 0 ? `${named.join(", ")}, and ${String(rest)} more` : named.join(", ");
}

/** How a channel's threads are listed, before the list. */
const ITS_THREADS = "Its threads, the pinned ones first and then the most recently active:";

/** `where` is "#ops" or "your DM with maya". */
export function noSuchThread(where: string, thread: string, threads: readonly Thread[]): string {
  return `There is no thread called ${thread} in ${where}. ${ITS_THREADS} ${listOf(threads)}.`;
}

export function manyThreads(where: string, thread: string, threads: readonly Thread[]): string {
  return `More than one thread of ${where} is called ${thread}: ${listOf(threads)}. Give its ID instead.`;
}

/** That `@name` alone is no thread to read, and the threads of the DM with them. */
export function whichDmThread(name: string, threads: readonly Thread[]): string {
  if (threads.length === 0) return `There is nothing to read in your DM with ${name} yet.`;
  return (
    `Your DM with ${name} has a thread for each conversation, so say which to read with from: "@${name}/thread", ` +
    `by its ID or its name. ${ITS_THREADS} ${listOf(threads)}.`
  );
}

/** That the room called `name` has no pinned thread for `#room` alone to mean, and its threads. */
export function whichRoomThread(name: string, threads: readonly Thread[], argument: PlaceArgument): string {
  const room = roomLabel(name);
  if (threads.length === 0) return `${room} has no threads, so ${nowhere(argument)}.`;
  return `${room} has no pinned thread, so say which with ${argument}: "${room}/thread", by its ID or its name. ${ITS_THREADS} ${listOf(threads)}.`;
}

const nowhere = (argument: PlaceArgument): string =>
  argument === "to" ? "there is nowhere to send this" : "there is nothing to read";

export function nobody(name: string, members: string[]): string {
  return `Nobody is called @${name}. The members are: ${members.join(", ")}.`;
}

export function noDmYet(name: string, argument: PlaceArgument): string {
  return argument === "to"
    ? `You have no DM with ${name} yet, so it has no threads. to: "@${name}" starts one.`
    : `You have no DM with ${name} yet, so there is nothing to read. Writing to them starts one.`;
}

export function noRoster(name: string, argument: PlaceArgument): string {
  return `Can't look up @${name}: the gateway is unreachable right now, so ${nowhere(argument)}. Try again later.`;
}

export function yourself(name: string, argument: PlaceArgument): string {
  const tail = argument === "to" ? "post to this thread" : "read this thread";
  return `@${name} is you. Leave ${argument} out to ${tail}.`;
}

export function noThreadHere(argument: PlaceArgument): string {
  return argument === "to"
    ? "This session is not in a thread, so there is no thread to post to by default. Say where with to: @name, which " +
        "starts a thread with them, @name/thread for one of your threads with them, or #room."
    : "This session is not in a thread, so there is no thread to read by default. Say which with from: @name/thread or #room.";
}

// How chat answered.

export const SEND_EMPTY = "Not sent: there is no text to post.";
export const SEND_UNREACHABLE = "Not sent: chat is unreachable right now, so nothing was posted. Try again later.";
export const READ_UNREACHABLE = "Not read: chat is unreachable right now. Try again later.";

export function sendCutOff(posted: number, total: number): string {
  return (
    `Chat became unreachable after ${posted} of ${total} parts were posted. The rest was not sent. ` +
    "Try again later, and send only the rest."
  );
}

export function sendUncertain(confirmed: number, total: number): string {
  if (confirmed === 0) {
    return (
      "Chat dropped the connection before it confirmed the message, so it may or may not have been posted. " +
      "Read the thread to check before you send it again."
    );
  }
  return (
    `Chat dropped the connection after ${confirmed} of ${total} parts were confirmed, and the next may or ` +
    "may not have been posted. Read the thread to check before you send the rest."
  );
}

export function sendRefused(reason: string, posted: number, total: number): string {
  if (posted === 0) return `Not sent: chat did not accept it (${reason}).`;
  return `Chat did not accept part ${posted + 1} of ${total} (${reason}) after ${posted} were posted. The rest was not sent.`;
}

export const readRefused = (reason: string): string => `Not read: chat did not accept it (${reason}).`;

// What worked.

/** `again` is what `to` takes to post in the same thread again, for a thread the post started. */
export function posted(label: string, parts: number, here: boolean, again?: string): string {
  const sentence = `Posted to ${label}${parts > 1 ? ` in ${parts} parts` : ""}.`;
  if (again !== undefined) return `${sentence} To post there again, use to: "${again}".`;
  return here ? `${sentence} Your reply at the end of your turn is posted too, so if this said it all, finish with END.` : sentence;
}

export function readHeader(label: string): string {
  return `Messages in ${label}, oldest first:`;
}

export function nothingToRead(label: string, older: boolean): string {
  return older ? `There are no older messages in ${label}.` : `There are no messages in ${label} yet.`;
}

export function olderMessages(before: number, from: string | undefined): string {
  const where = from === undefined ? "" : ` and from: "${from}"`;
  return `There are older messages. To read them, call read_messages again with before: ${before}${where}.`;
}
