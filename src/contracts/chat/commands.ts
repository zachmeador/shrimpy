/**
 * A command a person can write in a thread for the agents there to act on at
 * once, with no model call, and what it does in one line, for a DM and for a
 * room. The name is written after a slash. A client shows the line where the
 * person is writing, and an agent acts on the name, so the two cannot come to
 * disagree.
 */
export interface AgentCommandLines {
  dm: string;
  room: string;
}

export const AGENT_COMMANDS = {
  stop: {
    dm: "Stop the agent's work in this thread.",
    room: "Stop every agent here, or those named first: @scout /stop",
  },
} as const satisfies Record<string, AgentCommandLines>;

/** The name of a command for agents, without its slash. */
export type AgentCommand = keyof typeof AGENT_COMMANDS;
