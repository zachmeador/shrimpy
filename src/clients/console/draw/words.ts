import type { InFull } from "../../view/index.ts";

/*
 * Every sentence the console says that names one of its keys, in one place.
 * Everything else it says comes from the views the clients share.
 */

/** What the console calls itself in a sentence the views say, such as that a program runs another version of Shrimpy. */
export const SELF = "this console";

/** What the keys that depend on the screen do on it. The line of keys is made from this, so it names what they do. */
export interface Can {
  /** Esc goes back a level. It does nothing on the agents and rooms. */
  back: boolean;
  /** There is an input, and Enter sends what is typed in it. */
  send: boolean;
  /** Ctrl+N starts a thread. */
  newThread: boolean;
  /** Left and Right choose between everything on an agent's list and only what is with the person. */
  filter: boolean;
  /** Tab puts the agent's view of the session behind a thread on show in place of the conversation, and the conversation back. */
  turnOver: boolean;
  /** Ctrl+O and Ctrl+T switch tool calls and thinking between brief and in full: work is shown here. */
  work: boolean;
}

/**
 * What the line of keys at the bottom of a screen says: every key that does
 * something there, each with what it does. Where Tab goes depends on which side
 * of a thread is on show: its conversation, or its session as the agent sees it.
 */
export function keyHints(screen: "agents" | "threads" | "thread" | "session", can: Can, inFull: InFull): string[] {
  const hints: string[] = [];
  if (screen === "thread" && can.send) hints.push("enter send");
  else if (screen === "agents" || screen === "threads") hints.push("↑↓ choose", "enter open");
  if (can.filter) hints.push("←→ everything or yours");
  if (can.newThread) hints.push("ctrl+n new thread");
  if (can.turnOver) hints.push(screen === "session" ? "tab conversation" : "tab agent's view");
  if (can.back) hints.push("esc back");
  if (can.work) {
    hints.push(`ctrl+o tool calls: ${inFull.toolCalls ? "full" : "brief"}`, `ctrl+t thinking: ${inFull.thinking ? "full" : "brief"}`);
  }
  hints.push("ctrl+d quit", can.send ? "ctrl+c clear, then quit" : "ctrl+c twice to quit");
  return hints;
}

export const QUIT_AGAIN = "Press Ctrl+C again to quit.";

/**
 * What an agent's list says when it is empty: `notTalked`, the views' sentence
 * that the person has not talked to the agent yet, then how to start a thread,
 * and, when `more` says the filter leaves something out, how to see everything
 * the agent, `agent` on one line, takes part in.
 */
export const emptyAgentList = (notTalked: string, agent: string, more: boolean): string =>
  `${notTalked} Press Ctrl+N to start a thread.${more ? ` Left shows everything ${agent} takes part in.` : ""}`;
