import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Harness } from "@earendil-works/pi-durable";
import { asError } from "../../lib/errors/index.ts";
import { storageOfAnotherVersion } from "../home/index.ts";
import { DOCUMENTS, FeedDoc, ProcessesDoc, RecordsDoc, SessionsDoc, TriggersDoc, WatchesDoc } from "./documents.durable.ts";

/** The kinds of Shrimpy's own documents, which the engine names when it refuses one. */
const KINDS = new Set(DOCUMENTS.map(({ definition }) => definition.kind));

/**
 * Open the agent's records at the start, and say what they are called: the ID
 * they are given, in a commit of their own, the first time they are opened.
 * `file` is where the records are kept.
 */
export async function openRecords(harness: Harness, file: string): Promise<string> {
  const known = await read(harness, file);
  return known ?? harness.commit(async (tx) => (await tx.doc(RecordsDoc)).id, BACKGROUND_CONTEXT);
}

async function read(harness: Harness, file: string): Promise<string | undefined> {
  try {
    await harness.snapshot(SessionsDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(FeedDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(TriggersDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(WatchesDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(ProcessesDoc, BACKGROUND_CONTEXT);
    return (await harness.snapshot(RecordsDoc, BACKGROUND_CONTEXT))?.id;
  } catch (error) {
    const said = asError(error).message;
    if (anotherVersionWrote(said)) throw new Error(`${storageOfAnotherVersion(file)} The engine said: ${said}.`, { cause: error });
    throw new Error(`The agent's records in ${file} could not be read: ${said}`, { cause: error });
  }
}

function anotherVersionWrote(said: string): boolean {
  const kind = /^Document \S+ \((.+)\) (?:has newer version \d+ than \d+|requires migration from version \d+)$/.exec(said)?.[1];
  return kind !== undefined && KINDS.has(kind);
}
