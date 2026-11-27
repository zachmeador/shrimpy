import { fetchFile, type Message } from "../../contracts/chat/index.ts";
import { why } from "../../lib/files/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { KeptFiles } from "../home/index.ts";
import { type Attached, attachedOf, type Backlog, type Snapshot } from "../inputs/index.ts";
import type { ChatCalls } from "../links/index.ts";
import { charactersOf } from "./backlog.ts";

/** What saving a message's files in the home takes: chat to read them from, the home's files, and when to give up. */
export interface FilesContext {
  chat: ChatCalls;
  files: KeptFiles;
  signal: AbortSignal;
}

/**
 * The files of a message sent at `sentAt`, each with where it is in the home,
 * saved there first if it wasn't, or with why it couldn't be: chat no longer
 * has it, or the home wouldn't take it. A link that drops while a file comes
 * throws, so the whole is tried again with the link that follows.
 */
export async function inHome(context: FilesContext, files: readonly Attached[], sentAt: number): Promise<Attached[]> {
  const placed: Attached[] = [];
  for (const file of files) {
    const known = context.files.whereIs(file.id);
    if (known !== undefined) {
      placed.push({ ...file, path: known });
      continue;
    }
    let bytes: Uint8Array;
    try {
      bytes = await fetchFile(file.size, (offset, length) => context.chat.download(file.id, offset, length, context.signal));
    } catch (error) {
      if (!isRefusal(error)) throw error;
      placed.push({ ...file, missing: "chat no longer has it" });
      continue;
    }
    try {
      placed.push({ ...file, path: context.files.keep(file, sentAt, bytes) });
    } catch (error) {
      placed.push({ ...file, missing: why(error) });
    }
  }
  return placed;
}

/** A message the agent takes up, or one it is shown, with its files in the home. Any other event comes back as it was. */
export async function snapshotInHome<S extends Snapshot>(context: FilesContext, snapshot: S): Promise<S> {
  if (snapshot.kind !== "posted" || snapshot.attachments === undefined) return snapshot;
  return { ...snapshot, attachments: await inHome(context, snapshot.attachments, snapshot.sentAt) };
}

/**
 * What was said in a thread since the agent last looked, with each message's
 * files in the home, and the characters it takes counted again, since where a
 * file is takes more words than its name.
 */
export async function backlogInHome(context: FilesContext, backlog: Backlog): Promise<Backlog> {
  const messages = [];
  for (const message of backlog.messages) messages.push(message.kind === "posted" ? await snapshotInHome(context, message) : message);
  return { ...backlog, messages, ...(backlog.usedChars === undefined ? {} : { usedChars: charactersOf(messages) }) };
}

/** The files of each of `messages`, in order, saved in the home, for the model to read the messages back. */
export async function filesOfMessages(context: FilesContext, messages: readonly Message[]): Promise<Attached[][]> {
  const placed: Attached[][] = [];
  for (const message of messages) placed.push(await inHome(context, attachedOf(message.attachments).attachments ?? [], message.sentAt));
  return placed;
}
