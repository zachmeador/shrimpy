import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { AgentEndpoint } from "../../contracts/agent/index.ts";
import type { ChatEndpoint } from "../../contracts/chat/index.ts";
import { type Child, startChild } from "../../lib/testing/index.ts";
import type { FauxScenario } from "./index.ts";

const childScript = fileURLToPath(new URL("./agent-child.ts", import.meta.url));

/**
 * Start a whole agent on `home` in its own process, and wait until it is
 * listening. With `chat`, it takes part in chat as Scout, finding the chat
 * server at that endpoint; `holdReceipts` keeps the receipts it leaves from
 * ever reaching chat. It is killed when the test ends if it is still running.
 */
export function startAgentChild(
  t: TestContext,
  home: string,
  scenario: FauxScenario,
  tokensPerSecond: number,
  chat?: ChatEndpoint,
  options: { holdReceipts?: boolean } = {},
): Promise<Child<AgentEndpoint & { event: string }>> {
  const args = [
    home,
    scenario,
    String(tokensPerSecond),
    ...(chat === undefined ? [] : [JSON.stringify(chat), ...(options.holdReceipts === true ? ["hold-receipts"] : [])]),
  ];
  return startChild(t, { file: childScript, args });
}
