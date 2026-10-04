/**
 * A whole agent in its own process, for tests that kill it:
 *
 *   node agent-child.ts <home> <scenario> [tokensPerSecond] [hold-receipts]
 *
 * It takes part in the network as the agent Scout: it joins the roster of the
 * gateway in the runtime directory the test has, registers there and finds chat
 * through it. With `hold-receipts`, the receipts it leaves never get to chat:
 * the reply is out, and the receipt is on its way for as long as the agent
 * lives. Prints one JSON line when it is listening, then runs until SIGTERM.
 */
import { connectLocal } from "../../contracts/chat/node.ts";
import type { ChatConnection } from "../../contracts/chat/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startAgent } from "../index.ts";
import { type FauxScenario, fauxModels } from "./index.ts";
import { SCOUT } from "./names.ts";

const [home, scenario, tokensPerSecond, hold] = process.argv.slice(2);
if (home === undefined || scenario === undefined) {
  throw new Error("usage: agent-child.ts <home> <scenario> [tokensPerSecond] [hold-receipts]");
}

/** The connection, except that a receipt is never delivered: the call waits until it is cancelled. */
function holdingReceipts(connection: ChatConnection): ChatConnection {
  return {
    ...connection,
    chat: {
      ...connection.chat,
      leaveReceipt: (_ids, _receipt, signal) =>
        new Promise<never>((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
        }),
    },
  };
}

await runUntilStopped(
  () =>
    startAgent({
      home,
      name: SCOUT,
      ...fauxModels({
        home,
        scenario: scenario as FauxScenario,
        tokensPerSecond: tokensPerSecond === undefined ? undefined : Number(tokensPerSecond),
      }),
      join: {
        reachChat: (registered) =>
          connectLocal(registered).then((connection) => (hold === "hold-receipts" ? holdingReceipts(connection) : connection)),
        backoff: () => backoff({ firstMs: 20, maxMs: 100 }),
      },
    }),
  (agent) => ({ event: "listening", ...agent.endpoint }),
);
