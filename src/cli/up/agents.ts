import { basename } from "node:path";
import { membershipFile, removedAdvice } from "../../contracts/agent/index.ts";
import { AgentNotRunningError, connectHome, readEndpoint, readMembership } from "../../contracts/agent/node.ts";
import type { Io } from "../io/index.ts";
import { type Held, launch, type Started } from "./launch.ts";

/** How the start of an agent went: it started, one that someone else started is running there, or its home notes that it was removed. */
export interface AgentStart {
  started?: Started;
  /** The process ID of the agent that someone else started, which is used as it is. */
  running?: number;
  /** The home notes that the gateway turned its agent away as removed, so it isn't started. */
  removed?: true;
  /** What to say of it. */
  line: string;
}

/**
 * Start the agent at `home`, unless one already is, or its home notes that
 * the gateway removed it, and say which in a line. The lines the agent prints
 * while it starts are kept in `held` when it is given, and are printed, as
 * they would have been, only if the agent starts.
 */
export async function startAgent(io: Io, home: string, held?: Held): Promise<AgentStart> {
  const removed = removedHere(home);
  if (removed !== undefined) return { removed: true, line: removed };
  const running = await runningAgent(home);
  if (running !== undefined) {
    return { running, line: `The agent at ${home} is already running (pid ${running}); using it as it is.` };
  }
  // The agent's name is only known once it says it is listening.
  const label = { text: `agent ${basename(home)}` };
  const program = await launch(io, label, `the agent at ${home}`, ["agent", "serve", home], held);
  const name = program.listening.name ?? basename(home);
  label.text = `agent ${name}`;
  return {
    started: { role: "agent", what: `the agent ${name}`, program, startedAt: Date.now() },
    line: `Started the agent ${name} (pid ${program.pid}) from ${home}.`,
  };
}

/** The process ID of the agent that owns `home`, or undefined if none answers there. */
export async function runningAgent(home: string): Promise<number | undefined> {
  const endpoint = readEndpoint(home);
  if (endpoint === undefined) return undefined;
  try {
    await (await connectHome(home)).close();
    return endpoint.pid;
  } catch (error) {
    if (error instanceof AgentNotRunningError) return undefined;
    throw error;
  }
}

/**
 * Why the agent at `home` isn't started, when its home notes that the gateway
 * turned it away as removed, or undefined when it doesn't, or its membership
 * can't be read, which starting it says.
 */
export function removedHere(home: string): string | undefined {
  let membership: ReturnType<typeof readMembership>;
  try {
    membership = readMembership(home);
  } catch {
    return undefined;
  }
  const removal = membership?.removed;
  if (removal === undefined) return undefined;
  return `The gateway removed the agent at ${home}, so it isn't started: ${removal.words} ${removedAdvice(membershipFile(home), membership?.gateway !== undefined)}`;
}
