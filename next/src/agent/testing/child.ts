import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { AgentEndpoint } from "../../contracts/agent/index.ts";
import { type Child, startChild } from "../../lib/testing/index.ts";
import type { FauxScenario } from "./index.ts";

const childScript = fileURLToPath(new URL("./agent-child.ts", import.meta.url));

/**
 * Start a whole agent on `home` in its own process, and wait until it is
 * listening. It is killed when the test ends if it is still running.
 */
export function startAgentChild(
  t: TestContext,
  home: string,
  scenario: FauxScenario,
  tokensPerSecond: number,
): Promise<Child<AgentEndpoint & { event: string }>> {
  return startChild(t, { file: childScript, args: [home, scenario, String(tokensPerSecond)] });
}
