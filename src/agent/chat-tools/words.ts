import { MAX_ATTACHED_BYTES, MAX_ATTACHMENTS, roomLabel, type Thread } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { cutEnd, listed, sizeWords } from "../../lib/text/index.ts";

/** Maximum characters kept as the one-line summary of a watched post. */
const START_LENGTH = 80;

export const THIS_THREAD = "this thread";
export const UNREACHABLE = "Chat is not reachable right now. Try again later.";

/** First line of a post, trimmed and cut to a short summary. */
export function startOf(text: string): string {
  const first = text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  return cutEnd(oneLine(first), START_LENGTH, { ending: "…" });
}

export const dmWith = (name: string): string => `your DM with ${name}`;
export const theRoom = (name: string): string => `the room ${roomLabel(name)}`;
export const dmThreadLabel = (name: string, threadId: string): string => `thread ${threadId} of your DM with ${name}`;
export const newDmThread = (name: string, threadId: string): string => `new thread ${threadId} of your DM with ${name}`;
export const roomThreadLabel = (thread: string, room: string): string => `thread ${thread} of ${roomLabel(room)}`;

export function badPlace(arg: string): string {
  return `${arg} must be a thread ID (th_...), @name, @name/<thread>, #room, or #room/<thread>.`;
}

export function noRoster(name: string): string {
  return `The roster has not arrived yet, so I don't know who @${name} is. Try again in a moment.`;
}

export function nobody(name: string, names: readonly string[]): string {
  const who = names.length === 0 ? "There is nobody else on the roster." : `Members on the roster: ${listed(names)}.`;
  return `Nobody on the roster is called @${name}. ${who}`;
}

export function yourself(name: string): string {
  return `@${name} is you. Name another person or agent.`;
}

export function noDmYet(name: string): string {
  return `You have no DM with ${name} yet.`;
}

export function whichDmThread(name: string, threads: readonly Thread[]): string {
  if (threads.length === 0) return `You have no threads with ${name} yet.`;
  return `Your DM with ${name} has several threads. Name one with its ID (th_...) or @${name}/<thread>:\n${threadBullets(threads)}`;
}

export function whichRoomThread(room: string, threads: readonly Thread[]): string {
  if (threads.length === 0) return `${roomLabel(room)} has no threads yet.`;
  return `${roomLabel(room)} has no pinned thread. Name one with its ID (th_...) or #${room}/<thread>:\n${threadBullets(threads)}`;
}

export function noSuchThread(where: string, wanted: string, threads: readonly Thread[]): string {
  if (threads.length === 0) return `${where} has no thread called "${wanted}" (it has no threads yet).`;
  return `${where} has no thread called "${wanted}". Threads there:\n${threadBullets(threads)}`;
}

export function manyThreads(where: string, wanted: string, matches: readonly Thread[]): string {
  return `More than one thread in ${where} is called "${wanted}". Use the thread's ID:\n${threadBullets(matches)}`;
}

export function threadNotFound(id: string): string {
  return `No thread with ID ${id} was found in any of your channels.`;
}

export function threadBullets(threads: readonly Thread[]): string {
  return threads
    .map((t) => {
      const title = t.name ?? t.preview ?? "(empty)";
      const flags = [t.pinned !== null ? "pinned" : undefined, t.archived ? "archived" : undefined].filter(Boolean);
      const suffix = flags.length > 0 ? ` [${flags.join(", ")}]` : "";
      return `- ${t.id}: ${oneLine(title)}${suffix}`;
    })
    .join("\n");
}

export const ATTACH_DESCRIPTION =
  "Attach files to your reply in this thread: paths in your home, or any file you can read. " +
  "They are sent now and go with your final text when your turn ends, or alone if you end it with END. " +
  `A reply carries up to ${MAX_ATTACHMENTS} files and ${sizeWords(MAX_ATTACHED_BYTES)} in all. ` +
  "To send files anywhere else, or right away, pass them to post as `attach`.";

export const FILE_PATHS = "Paths of files: relative to your home, absolute, or starting with ~/.";

export const NO_FILES = "Name at least one file to attach.";

/** What the agent is told of files it attached to its reply. */
export function attached(sent: readonly { name: string; size: number }[]): string {
  const named = listed(sent.map((file) => `${file.name} (${sizeWords(file.size)})`));
  return `Attached ${named} to your reply. ${sent.length === 1 ? "It goes" : "They go"} with your final text.`;
}

/** What says which files went with a post. */
export const withFiles = (sent: readonly { name: string }[]): string =>
  sent.length === 0 ? "" : ` with ${listed(sent.map((file) => file.name))}`;

export const tooManyFiles = (count: number): string => `A message carries up to ${MAX_ATTACHMENTS} files, and these are ${count}.`;
export const tooBig = (bytes: number): string =>
  `A message carries up to ${sizeWords(MAX_ATTACHED_BYTES)} of files, and these are ${sizeWords(bytes)}. Send fewer, or smaller ones.`;
export const notAFile = (path: string): string => `${path} is not a file.`;
export const emptyFile = (path: string): string => `${path} is empty, and chat takes no empty file.`;
export const unreadableFile = (path: string, why: string): string => `${path} can't be read: ${why}.`;
export const filesRefused = (why: string): string => `Chat refused the files: ${why}`;
