/**
 * A command a person can write in a thread for the agents there to act on at
 * once, with no model call, what it does in one line, for a DM and for a room,
 * and who it is for in a room when it names nobody. The name is written after a
 * slash. A client shows the line where the person is writing and tells who the
 * command is for, and an agent acts on the name and on who it is for, so the
 * two cannot come to disagree.
 */
export interface AgentCommandLines {
  dm: string;
  room: string;
  /**
   * Who the command is for in a room when the post mentions no member: every
   * agent there, or none, so that an agent acts on it only when it is named.
   * A post that mentions members is for those it mentions, and `@all` is for
   * everyone. In a DM it is for the agent.
   */
  withoutMention: "everyone" | "nobody";
}

export const AGENT_COMMANDS = {
  model: {
    dm: "Show the model of this thread, or try another one.",
    room: "Try another model in this thread, for the agent named first: @scout /model provider/id, or @all",
    withoutMention: "nobody",
  },
  stop: {
    dm: "Stop the agent's work in this thread.",
    room: "Stop every agent here, or those named first: @scout /stop",
    withoutMention: "everyone",
  },
} as const satisfies Record<string, AgentCommandLines>;

/** The name of a command for agents, without its slash. */
export type AgentCommand = keyof typeof AGENT_COMMANDS;
