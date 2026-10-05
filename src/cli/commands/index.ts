/**
 * The `shrimpy` commands, in families. A family loads when one of its commands
 * is used, so a session command does not load the agent program or the chat
 * server. It must not know how a command reads its own arguments.
 */
import type { Command } from "./command.ts";

export type { Command } from "./command.ts";

type Family = () => Promise<Command[]>;

// A family is named by the first word of its commands. The commands for using
// Shrimpy come first, as the ones people use most.
const USING = new Map<string, Family>([
  ["up", async () => (await import("./up.ts")).upCommands],
  ["run", async () => (await import("./run.ts")).runCommands],
  ["threads", async () => (await import("./threads.ts")).threadsCommands],
  ["read", async () => (await import("./read.ts")).readCommands],
  ["rooms", async () => (await import("./rooms.ts")).roomsCommands],
]);

// The commands that start, stop, inspect and repair its programs and homes.
const RUNNING = new Map<string, Family>([
  ["agent", async () => (await import("./agent.ts")).agentCommands],
  ["sessions", async () => (await import("./sessions.ts")).sessionsCommands],
  ["triggers", async () => (await import("./triggers.ts")).triggersCommands],
  ["gateway", async () => (await import("./gateway.ts")).gatewayCommands],
  ["chat", async () => (await import("./chat.ts")).chatCommands],
]);

const FAMILIES = new Map([...USING, ...RUNNING]);

/** The commands of one family, or undefined if there is no such family. */
export function loadFamily(family: string): Promise<Command[]> | undefined {
  return FAMILIES.get(family)?.();
}

/** The commands for using Shrimpy, and the ones for running it and looking after it, each in the order they are listed. */
export async function loadGroups(): Promise<{ using: Command[]; running: Command[] }> {
  const load = async (families: Map<string, Family>): Promise<Command[]> =>
    (await Promise.all([...families.values()].map((family) => family()))).flat();
  return { using: await load(USING), running: await load(RUNNING) };
}

export async function loadAll(): Promise<Command[]> {
  const { using, running } = await loadGroups();
  return [...using, ...running];
}
