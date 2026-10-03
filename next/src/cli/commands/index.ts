/**
 * The `shrimpy` commands, in families. A family loads when one of its commands
 * is used, so a session command does not load the agent program. It must not
 * know how a command reads its own arguments.
 */
import type { Command } from "./command.ts";

export type { Command } from "./command.ts";

const FAMILIES = new Map<string, () => Promise<Command[]>>([
  ["agent", async () => (await import("./agent.ts")).agentCommands],
  ["sessions", async () => (await import("./sessions.ts")).sessionsCommands],
]);

/** The commands of one family, or undefined if there is no such family. */
export function loadFamily(family: string): Promise<Command[]> | undefined {
  return FAMILIES.get(family)?.();
}

export async function loadAll(): Promise<Command[]> {
  return (await Promise.all([...FAMILIES.values()].map((load) => load()))).flat();
}
