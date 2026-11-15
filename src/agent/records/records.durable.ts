import { basename } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Harness } from "@earendil-works/pi-durable";
import { FeedDoc, QuestionsDoc, RecordsDoc, SessionsDoc, TriggersDoc } from "./documents.durable.ts";

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
 * file into an archive folder and start the agent again. Gives the records'
 * ID, if they have one yet.
 */
async function read(harness: Harness, file: string): Promise<string | undefined> {
  try {
    await harness.snapshot(SessionsDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(FeedDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(TriggersDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(QuestionsDoc, BACKGROUND_CONTEXT);
    return (await harness.snapshot(RecordsDoc, BACKGROUND_CONTEXT))?.id;
  } catch (error) {
    throw new Error(refusal(file, error instanceof Error ? error.message : String(error)), { cause: error });
  }
}

function refusal(file: string, reason: string): string {
  const name = basename(file);
  return (
    `The agent's Pi storage in ${file} was written by another version of Shrimpy, and nothing converts it. ` +
    `Move ${file} into an archive folder, with ${name}-wal and ${name}-shm if they are beside it, and start the agent again. ` +
    `Its sessions go with it, and the rest of the home stays. The engine said: ${reason}.`
  );
}
