import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { AgentNotRunningError, connectHome } from "../../contracts/agent/node.ts";
import { type Program, Roster } from "../../contracts/gateway/index.ts";
import { connectGateway, gatewaySocket } from "../../contracts/gateway/node.ts";
import { eventually } from "../../lib/testing/index.ts";

/** What the gateway on this machine lists as linked now, or undefined while no gateway answers. */
async function linkedNow(): Promise<Program[] | undefined> {
  let client;
  try {
    client = await connectGateway({ place: { path: gatewaySocket() }, token: null });
  } catch {
    return undefined;
  }
  try {
    const roster = await client.host.get(Roster, {}, BACKGROUND_CONTEXT);
    try {
      return roster.programs.value;
    } finally {
      roster.release();
    }
  } finally {
    await client.close();
  }
}

/**
 * Wait until the gateway on this machine lists the program as linked, and say
 * what it lists. A program prints that it is listening before it has linked,
 * so a test that needs the link waits for it.
 */
export async function untilLinked(kind: Program["kind"], name: string): Promise<Program> {
  const found = await eventually(
    async () => (await linkedNow())?.findLast((program) => program.kind === kind && program.name === name),
    (program) => program !== undefined,
    { what: `the ${kind} ${name} to link to the gateway`, timeoutMs: 30_000 },
  );
  if (found === undefined) throw new Error(`The ${kind} ${name} did not link`);
  return found;
}

/** Wait until a gateway answers on this machine's socket. */
export async function untilGatewayAnswers(): Promise<void> {
  await eventually(linkedNow, (programs) => programs !== undefined, { what: "a gateway to answer", timeoutMs: 30_000 });
}

/** Wait until the agent that owns `home` answers there, by the home's path, which an agent does before it links to any gateway. */
export async function untilAnswering(home: string): Promise<void> {
  const answers = async (): Promise<boolean> => {
    try {
      await (await connectHome(home)).close();
      return true;
    } catch (error) {
      if (error instanceof AgentNotRunningError) return false;
      throw error;
    }
  };
  await eventually(answers, (answered) => answered, { what: `the agent at ${home} to answer`, timeoutMs: 30_000 });
}
