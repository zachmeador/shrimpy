import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Harness } from "@earendil-works/pi-durable";
import { storageOfAnotherVersion } from "../home/index.ts";
import { FeedDoc, QuestionsDoc, RecordsDoc, SessionsDoc, TriggersDoc } from "./documents.durable.ts";

/** The kinds of Shrimpy's own documents, which the engine names when it refuses one. */
const KINDS = new Set([SessionsDoc, FeedDoc, TriggersDoc, QuestionsDoc, RecordsDoc].map(({ definition }) => definition.kind));

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
 * converts one, so then the person is told to move the file into an archive
 * folder and start the agent again. Any other failure is told as it is, with
 * the file, since that advice would lose every session for nothing. Gives the
 * records' ID, if they have one yet.
 */
async function read(harness: Harness, file: string): Promise<string | undefined> {
  try {
    await harness.snapshot(SessionsDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(FeedDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(TriggersDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(QuestionsDoc, BACKGROUND_CONTEXT);
    return (await harness.snapshot(RecordsDoc, BACKGROUND_CONTEXT))?.id;
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    if (anotherVersionWrote(said)) throw new Error(`${storageOfAnotherVersion(file)} The engine said: ${said}.`, { cause: error });
    throw new Error(`The agent's records in ${file} could not be read: ${said}`, { cause: error });
  }
}

/**
 * Whether the engine refused one of Shrimpy's own documents because another
 * version of Shrimpy wrote it. Durable says so only in words: a plain error that
 * names the document's kind and the version it holds, newer than this one, or
 * older with nothing to convert it.
 */
function anotherVersionWrote(said: string): boolean {
  const kind = /^Document \S+ \((.+)\) (?:has newer version \d+ than \d+|requires migration from version \d+)$/.exec(said)?.[1];
  return kind !== undefined && KINDS.has(kind);
}
