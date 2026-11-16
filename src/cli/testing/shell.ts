import type { TestContext } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { initHome, saveMembership } from "../../contracts/agent/node.ts";
import { type Member, Roster } from "../../contracts/gateway/index.ts";
import { newToken } from "../../contracts/gateway/node.ts";
import { linkTestAgent, startTestGateway } from "../../contracts/gateway/testing/index.ts";
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
 * the test asks for `admin`: the roster makes its first agent one, and a shell
 * that the test did not ask to be one is made an ordinary agent. The test needs
 * the gateway of its own.
 */
export async function startAgentShell(t: TestContext, name: string, options: { admin?: true } = {}): Promise<AgentShell> {
  const token = newToken();
  // Linked once, so that the roster has the agent with its token, and let go, since no agent runs there.
  const joined = await linkTestAgent(t, name, { token });
  await joined.stop();
  let member = joined.you;
  const home = tempDir(t, `${name}-home`);
  initHome(home, { name, model: { provider: "local", id: "test-model" } });
  saveMembership(home, { token, memberId: member.id });
  const wanted = options.admin === true;
  if (member.admin !== wanted) {
    const person = await (await startTestGateway(t)).connect();
    const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);
    const answer = await (wanted ? roster.promote({ member: member.id }, BACKGROUND_CONTEXT) : roster.demote({ member: member.id }, BACKGROUND_CONTEXT));
    roster.release();
    if (answer.kind === "refused") throw new Error(answer.words);
    member = answer.value;
  }
  return { member, home, run: (args) => shrimpy(args, { env: { [AGENT_HOME_VARIABLE]: home } }) };
}
