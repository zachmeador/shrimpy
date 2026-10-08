import { AGENT_COMMANDS, type AgentCommandLines } from "../../../contracts/chat/index.ts";

/** A command the person can write in a thread, with its slash, and what it does where they are. */
export interface CommandLine {
  name: string;
  line: string;
}

/**
 * Every command that can be written in a thread of a DM with an agent, or of a
 * room, in order of name, each with what it does there.
 */
export function commandLines(where: keyof AgentCommandLines): CommandLine[] {
  return Object.entries(AGENT_COMMANDS)
    .map(([name, lines]) => ({ name: `/${name}`, line: lines[where] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
