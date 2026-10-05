import { basename } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Harness } from "@earendil-works/pi-durable";
import { FeedDoc, RecordsDoc, SessionsDoc, TriggersDoc } from "./documents.ts";

/**
 * Open the agent's records at the start, and say what they are called: the ID
 * they are given, in a commit of their own, the first time they are opened.
 * `file` is where the records are kept.
 */
export async function openRecords(harness: Harness, file: string): Promise<string> {
  const known = await read(harness, file);
  return known ?? harness.commit(async (tx) => (await tx.doc(RecordsDoc)).id, BACKGROUND_CONTEXT);
}

/**
 * Read each of Shrimpy's own documents once. The engine refuses a document that
 * another version wrote, in words that don't say what to do, and nothing
 * converts one, so the refusal is made here: the person is told to move the
 * file aside to start fresh. Gives the records' ID, if they have one yet.
 */
async function read(harness: Harness, file: string): Promise<string | undefined> {
  try {
    await harness.snapshot(SessionsDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(FeedDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(TriggersDoc, BACKGROUND_CONTEXT);
    return (await harness.snapshot(RecordsDoc, BACKGROUND_CONTEXT))?.id;
  } catch (error) {
    throw new Error(refusal(file, error instanceof Error ? error.message : String(error)), { cause: error });
  }
}

function refusal(file: string, reason: string): string {
  const name = basename(file);
  return (
    `Shrimpy can't read the agent's records in ${file}: ${reason}. ` +
    "Nothing converts records written by another version. " +
    `To start the agent fresh, move that file aside, with ${name}-wal and ${name}-shm if they are beside it. ` +
    "The sessions and unfinished work in it are not kept."
  );
}
