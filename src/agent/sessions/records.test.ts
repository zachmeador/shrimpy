import assert from "node:assert/strict";
import { renameSync } from "node:fs";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai";
import { defineDoc } from "@earendil-works/pi-durable";
import { tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { homePaths } from "../home/index.ts";
import { openHost } from "../host/index.ts";
import { startAgent } from "../index.ts";
import { closeAfter, fauxModels, SCOUT, startAgentRig } from "../testing/index.ts";
import { FeedDoc, ThreadsDoc } from "./documents.ts";

const timeout = 30_000;

/**
 * Put Shrimpy's own documents in the home's storage at the version before the
 * current one, as an agent of that version left them, and close it again.
 */
async function leaveOlderRecords(home: string): Promise<void> {
  const threads = defineDoc<{ sessions: Record<string, never> }>({
    kind: ThreadsDoc.definition.kind,
    version: ThreadsDoc.definition.version - 1,
    scope: "session",
    initial: () => ({ sessions: {} }),
  });
  const feed = defineDoc<{ cursor: number | null }>({
    kind: FeedDoc.definition.kind,
    version: FeedDoc.definition.version - 1,
    scope: "session",
    initial: () => ({ cursor: 7 }),
  });
  const host = await openHost({ home, models: createModels() });
  try {
    await host.harness.commit(async (tx) => {
      await tx.doc(threads);
      await tx.doc(feed);
    }, BACKGROUND_CONTEXT);
  } finally {
    await host.close();
  }
}

test("records another version wrote are refused at the start, the message says what to move aside, and the agent starts fresh without them", { timeout }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "records");
  const { database } = homePaths(home);
  await leaveOlderRecords(home);
  const start = () => startAgent({ home, name: SCOUT, ...fauxModels({ home }) });

  await assert.rejects(start(), (error: Error) => {
    assert.ok(error.message.includes(database), `names the file: ${error.message}`);
    assert.match(error.message, /Nothing converts/);
    return true;
  });

  renameSync(database, `${database}.aside`);
  closeAfter(t, await start());
});

test("an agent started fresh answers in a thread that its old records already posted a reply in, though the engine numbers its entries as it did before", { timeout }, async (t) => {
  const first = await startAgentRig(t);
  await first.receiptOn(await first.say("A, before the agent started fresh"));
  await first.agent.close();
  const { database } = homePaths(first.home);
  renameSync(database, `${database}.aside`);
  const later = await first.say("B, said while the agent was down");

  // The same work in a new database gives the engine's entries the same numbers: this answer is the first, as that one was.
  const second = await startAgentRig(t, { home: first.home, chat: first.chat });

  assert.equal((await second.receiptOn(later)).status, "answered");
  assert.equal((await second.replies()).length, 2, "the reply to A from before, and the reply to B");
});
