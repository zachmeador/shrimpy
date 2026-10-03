/**
 * A whole agent in its own process, for tests that kill it:
 *
 *   node agent-child.ts <home> <scenario> [tokensPerSecond]
 *
 * Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { startAgent } from "../index.ts";
import { type FauxScenario, fauxModels } from "./index.ts";

const [home, scenario, tokensPerSecond] = process.argv.slice(2);
if (home === undefined || scenario === undefined) {
  throw new Error("usage: agent-child.ts <home> <scenario> [tokensPerSecond]");
}

const agent = await startAgent({
  home,
  ...fauxModels({
    home,
    scenario: scenario as FauxScenario,
    tokensPerSecond: tokensPerSecond === undefined ? undefined : Number(tokensPerSecond),
  }),
});
process.stdout.write(`${JSON.stringify({ event: "listening", ...agent.endpoint })}\n`);

await new Promise<void>((resolve) => {
  process.once("SIGTERM", resolve);
  process.once("SIGINT", resolve);
});
await agent.close();
