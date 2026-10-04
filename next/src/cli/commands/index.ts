/**
 * The `shrimpy` commands, in families. A family loads when one of its commands
 * is used, so a session command does not load the agent program or the chat
 * server. It must not know how a command reads its own arguments.
 */
import type { Command } from "./command.ts";

export type { Command } from "./command.ts";

// A family is named by the first word of its commands. The talking commands come
// first, as the ones people use most.
const FAMILIES = new Map<string, () => Promise<Command[]>>([
  ["run", async () => (await import("./run.ts")).runCommands],
  ["threads", async () => (await import("./threads.ts")).threadsCommands],
  ["read", async () => (await import("./read.ts")).readCommands],
  ["agent", async () => (await import("./agent.ts")).agentCommands],
  ["sessions", async () => (await import("./sessions.ts")).sessionsCommands],
  ["gateway", async () => (await import("./gateway.ts")).gatewayCommands],
  ["chat", async () => (await import("./chat.ts")).chatCommands],
]);

/** The commands of one family, or undefined if there is no such family. */
export function loadFamily(family: string): Promise<Command[]> | undefined {
  return FAMILIES.get(family)?.();
}

export async function loadAll(): Promise<Command[]> {
  return (await Promise.all([...FAMILIES.values()].map((load) => load()))).flat();
}
