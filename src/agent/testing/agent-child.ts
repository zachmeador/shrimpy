/**
 * A whole agent in its own process, for tests that kill it:
 *
 *   node agent-child.ts <home> <scenario> [tokensPerSecond] [chat endpoint as JSON]
 *
 * With a chat endpoint it takes part in chat as the agent Scout, finding chat
 * there and registering with no gateway. Prints one JSON line when it is
 * listening, then runs until SIGTERM.
 */
import { connectLocal } from "../../contracts/chat/node.ts";
import type { ChatEndpoint } from "../../contracts/chat/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startAgent } from "../index.ts";
import { type FauxScenario, fauxModels } from "./index.ts";
import { scout } from "./names.ts";

const [home, scenario, tokensPerSecond, chatEndpoint] = process.argv.slice(2);
if (home === undefined || scenario === undefined) {
  throw new Error("usage: agent-child.ts <home> <scenario> [tokensPerSecond] [chat endpoint as JSON]");
}
const chat = chatEndpoint === undefined ? undefined : (JSON.parse(chatEndpoint) as ChatEndpoint);

await runUntilStopped(
  () =>
    startAgent({
      home,
      name: scout.name,
      ...fauxModels({
        home,
        scenario: scenario as FauxScenario,
        tokensPerSecond: tokensPerSecond === undefined ? undefined : Number(tokensPerSecond),
      }),
      ...(chat === undefined
        ? {}
        : {
            join: {
              register: false,
              openChat: () => connectLocal(chat),
              backoff: () => backoff({ firstMs: 20, maxMs: 100 }),
            },
          }),
    }),
  (agent) => ({ event: "listening", ...agent.endpoint }),
);
