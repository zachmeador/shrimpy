import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { AgentEndpoint } from "../../contracts/agent/index.ts";
import { type Child, startChild } from "../../lib/testing/index.ts";
import type { FauxScenario } from "./index.ts";

const childScript = fileURLToPath(new URL("./agent-child.ts", import.meta.url));

/**
 * Start a whole agent on `home` in its own process, and wait until it is
 * listening. It takes part in the network as Scout, through the gateway and
 * chat server the test runs; `holdReceipts` keeps the receipts it leaves from
 * ever reaching chat, and `graceMs` is how long SIGTERM lets running turns
 * finish. It is killed when the test ends if it is still running.
 */
export function startAgentChild(
  t: TestContext,
  home: string,
  scenario: FauxScenario,
  tokensPerSecond: number,
  options: { holdReceipts?: boolean; graceMs?: number } = {},
): Promise<Child<AgentEndpoint & { event: string }>> {
  const args = [
    home,
    scenario,
    String(tokensPerSecond),
    ...(options.holdReceipts === true ? ["hold-receipts"] : []),
    ...(options.graceMs === undefined ? [] : [`grace=${String(options.graceMs)}`]),
  ];
  return startChild(t, { file: childScript, args });
}
