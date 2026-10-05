/**
 * A whole agent in its own process, for tests that kill it:
 *
 *   node agent-child.ts <home> <scenario> [tokensPerSecond] [hold-receipts] [grace=<ms>] [shortest=<ms>]
 *
 * It takes part in the network as the agent Scout: it joins the roster of the
 * gateway in the runtime directory the test has, registers there and finds chat
 * through it. With `hold-receipts`, the receipts it leaves never get to chat:
 * the reply is out, and the receipt is on its way for as long as the agent
 * lives. With `grace`, SIGTERM gives running turns that many milliseconds to
 * finish before the agent stops, instead of the usual five seconds. With
 * `shortest`, a trigger may repeat as often as that many milliseconds, instead
 * of a minute. Prints one JSON line when it is listening, then runs until
 * SIGTERM.
 */
import { type ChatConnection, connectChat } from "../../contracts/chat/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { runUntilStopped } from "../../lib/testing/index.ts";
import { startAgent } from "../index.ts";
import { type FauxScenario, fauxModels } from "./index.ts";
import { SCOUT } from "./names.ts";

const [home, scenario, tokensPerSecond, ...flags] = process.argv.slice(2);
if (home === undefined || scenario === undefined) {
  throw new Error("usage: agent-child.ts <home> <scenario> [tokensPerSecond] [hold-receipts] [grace=<ms>] [shortest=<ms>]");
}
const hold = flags.includes("hold-receipts");
const grace = flags.find((flag) => flag.startsWith("grace="))?.slice("grace=".length);
const shortest = flags.find((flag) => flag.startsWith("shortest="))?.slice("shortest=".length);

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
  async () => {
    const agent = await startAgent({
      home,
      name: SCOUT,
      ...fauxModels({
        home,
        scenario: scenario as FauxScenario,
        tokensPerSecond: tokensPerSecond === undefined ? undefined : Number(tokensPerSecond),
      }),
      ...(shortest === undefined ? {} : { shortestEveryMs: Number(shortest) }),
      join: {
        connectChat: (options) => connectChat(options).then((connection) => (hold ? holdingReceipts(connection) : connection)),
        backoff: () => backoff({ firstMs: 20, maxMs: 100 }),
      },
    });
    return { endpoint: agent.endpoint, close: () => agent.close(grace === undefined ? {} : { graceMs: Number(grace) }) };
  },
  ({ endpoint }) => ({ event: "listening", ...endpoint }),
);
