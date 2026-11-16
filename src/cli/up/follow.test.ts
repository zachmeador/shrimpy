import assert from "node:assert/strict";
import { test } from "node:test";
import { AgentNotRunningError, connectHome } from "../../contracts/agent/node.ts";
import { stopAfter, useRuntimeDir } from "../../lib/testing/index.ts";
import { agentHome, captureIo, startModelServer } from "../testing/index.ts";
import { follow } from "./follow.ts";
import type { Started } from "./launch.ts";

/*
 * The tests of `shrimpy up` in cli/up.test.ts follow a real folder. A home can't be taken out of one while its agent
 * starts and the agent still start, since an agent refuses a home whose agent.json it can't see, and reads its home
 * again when anything there changes while it reads. So this follows a list of homes the test gives, and the agent is
 * real.
 */

test("an agent whose home goes while it starts is stopped once it has started", { timeout: 60_000 }, async (t) => {
  useRuntimeDir(t);
  const home = await agentHome(t, await startModelServer(t));
  const crew: Started[] = [];
  let homes = [home];
  // Nothing looks but the test.
  const pace = { lookMs: 3_600_000, pauseMs: 60_000, longestPauseMs: 60_000, stableMs: 60_000 };
  const folder = follow({ io: captureIo().io, crew, pace, homes: () => homes });
  stopAfter(t, async () => {
    await folder.close();
    await Promise.all(crew.map((member) => member.program.stop()));
  });

  const starting = folder.look();
  homes = [];
  await folder.look();
  await starting;

  assert.deepEqual(crew, [], "up keeps nothing running for the home");
  await assert.rejects(connectHome(home), AgentNotRunningError, "and no agent answers there");
});
