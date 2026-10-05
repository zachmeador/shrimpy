import type { TestContext } from "node:test";
import { initHome } from "../../agent/index.ts";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { saveMembership } from "../../contracts/agent/node.ts";
import type { Member } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { startTestGateway } from "../../contracts/gateway/testing/index.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { type CliResult, shrimpy } from "./process.ts";

/** The shell of an agent that has joined the roster, and the commands run in it. */
export interface AgentShell {
  /** Who the agent is on the roster. */
  readonly member: Member;
  /** Its home: made, with the token a command in its shell acts with. */
  readonly home: string;
  /** Run `shrimpy` as the agent's shell does. */
  run(args: string[]): Promise<CliResult>;
}

/**
 * The shell of the agent called `name`: it has joined the roster with a token
 * of its own, which its home keeps, and a command run in it acts with that
 * token. The home is made, but no agent runs there. It is not an admin unless
 * the person who runs the gateway has made it one. The test needs the gateway
 * of its own.
 */
export async function startAgentShell(t: TestContext, name: string, options: { admin?: true } = {}): Promise<AgentShell> {
  const gateway = await (await startTestGateway(t)).connect();
  const token = newToken();
  const member = await gateway.join(name, token);
  const home = tempDir(t, `${name}-home`);
  initHome(home, { name, model: { provider: "local", id: "test-model" } });
  saveMembership(home, { token, memberId: member.id });
  if (options.admin === true) await (await (await startTestGateway(t)).connect()).promote(member.id);
  return { member, home, run: (args) => shrimpy(args, { env: { [AGENT_HOME_VARIABLE]: home } }) };
}
