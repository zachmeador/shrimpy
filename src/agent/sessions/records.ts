import { basename } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Harness } from "@earendil-works/pi-durable";
import { FeedDoc, ThreadsDoc } from "./documents.ts";

/**
 * Read each of Shrimpy's own documents once, at the start. The engine refuses a
 * document that another version wrote, in words that don't say what to do, and
 * nothing converts one, so the refusal is made here: `file` is where the
 * records are kept, and the person is told to move it aside to start fresh.
 */
export async function checkRecords(harness: Harness, file: string): Promise<void> {
  try {
    await harness.snapshot(ThreadsDoc, BACKGROUND_CONTEXT);
    await harness.snapshot(FeedDoc, BACKGROUND_CONTEXT);
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
