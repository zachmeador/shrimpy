/**
 * The `shrimpy` commands, in families. A family loads when one of its commands
 * is used, so a session command does not load the agent program or the chat
 * server. It must not know how a command reads its own arguments.
 */
import type { Command } from "./command.ts";
import type { Pace } from "./up.ts";

export type { Command } from "./command.ts";
export type { Pace } from "./up.ts";

type Family = () => Promise<Command[]>;

// A family is named by the first word of its commands. They come in the order of the front page, and the programs
// that `up` runs come last.
const FAMILIES = new Map<string, Family>([
  ["up", async () => (await import("./up.ts")).upCommands],
  ["status", async () => (await import("./status.ts")).statusCommands],
  ["login", async () => (await import("./login.ts")).loginCommands],
  ["run", async () => (await import("./run.ts")).runCommands],
  ["agent", async () => (await import("./agent.ts")).agentCommands],
  ["triggers", async () => (await import("./triggers.ts")).triggersCommands],
  ["sessions", async () => (await import("./sessions.ts")).sessionsCommands],
  ["wake", async () => (await import("./wake.ts")).wakeCommands],
  ["threads", async () => (await import("./threads.ts")).threadsCommands],
  ["read", async () => (await import("./read.ts")).readCommands],
  ["rooms", async () => (await import("./rooms.ts")).roomsCommands],
  ["install", async () => (await import("./install.ts")).installCommands],
  ["uninstall", async () => (await import("./install.ts")).uninstallCommands],
  ["invite", async () => (await import("./invite.ts")).inviteCommands],
  ["join", async () => (await import("./join.ts")).joinCommands],
  ["members", async () => (await import("./members.ts")).membersCommands],
  ["gateway", async () => (await import("./gateway.ts")).gatewayCommands],
  ["chat", async () => (await import("./chat.ts")).chatCommands],
]);

/** The commands of one family, or undefined if there is no such family. */
export function loadFamily(family: string): Promise<Command[]> | undefined {
  return FAMILIES.get(family)?.();
}

/** Every command, family by family, in the order of the front page. */
export async function loadAll(): Promise<Command[]> {
  return (await Promise.all([...FAMILIES.values()].map((family) => family()))).flat();
}

/** `shrimpy up` with the times of `pace`, for a test that can't wait for the ones it has. */
export async function loadUpWithPace(pace: Pace): Promise<Command> {
  return (await import("./up.ts")).upCommand(pace);
}
