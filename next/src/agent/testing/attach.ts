import type { AgentConnection, SessionHandle } from "../../contracts/agent/index.ts";
import { attachLocal } from "../../contracts/agent/node.ts";

/** Connect to the agent that owns `home` and attach to its main session. */
export async function attachMain(
  home: string,
): Promise<{ connection: AgentConnection; session: SessionHandle }> {
  const connection = await attachLocal(home);
  const sessions = await connection.sessions();
  const main = sessions.find((session) => session.main);
  if (main === undefined) throw new Error("The agent has no main session");
  return { connection, session: await connection.attach(main.id) };
}
