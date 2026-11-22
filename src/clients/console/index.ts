/**
 * The terminal client, on the terminal's whole screen: the agents on the
 * Shrimpy network and the rooms you are in, everything an agent takes part in
 * as one list, or only your threads with it, or the threads of a room, side by
 * side as the width allows; talk in a thread, with `/status` to read how the
 * agent or the room stands, `/model` alone to read which model a thread with an
 * agent uses, and `/model` and a model as a message that the agent acts on;
 * watch each agent's work beside a thread, and put each agent's view of the
 * session behind it on show in place of the conversation, with the thread's
 * input still under it. An agent's list has its DMs with other agents, which
 * are read live with no input, and the sessions of its triggers, which are
 * watched. The agents and rooms also list the rooms of agents you are not in,
 * whose threads are read live, with no input. It makes no room and adds no
 * member. It lists the person's devices and takes one back with `/devices`,
 * which no agent may do for them. It is a client of the gateway, the chat
 * server and agents, holding their objects through one link to the gateway,
 * and it never opens a home, a store or a program's files. Only the command
 * line imports this, to open it. It must not know how a program works inside.
 */
export type { Screen as ConsoleScreen } from "./draw/index.ts";
export { type ConsoleOptions, openConsole } from "./console.ts";
