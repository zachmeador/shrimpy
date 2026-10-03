/**
 * A whole agent in its own process, for tests that kill it:
 *
 *   node agent-child.ts <home> <scenario> [tokensPerSecond]
 *
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startAgent } from "../index.ts";
import { type FauxScenario, fauxModels } from "./index.ts";

const [home, scenario, tokensPerSecond] = process.argv.slice(2);
if (home === undefined || scenario === undefined) {
  throw new Error("usage: agent-child.ts <home> <scenario> [tokensPerSecond]");
}

await runUntilStopped(
  () =>
    startAgent({
      home,
      ...fauxModels({
        home,
        scenario: scenario as FauxScenario,
        tokensPerSecond: tokensPerSecond === undefined ? undefined : Number(tokensPerSecond),
      }),
    }),
  (agent) => ({ event: "listening", ...agent.endpoint }),
);
