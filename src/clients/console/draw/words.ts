import { type InFull, thinkingShown, toolCallsShown } from "../../view/index.ts";

/*
 * Every sentence and label the console shows that names one of its keys or a
 * gesture, in one place. A key is a pair: the key as it is written, and what it
 * does, which the drawing styles apart. Everything else the console says comes
 * from the views the clients share.
 */

/** What the console calls itself in a sentence the views say, such as that a program runs another version of Shrimpy. */
export const SELF = "this console";

/** A key, as it is written, and what it does. */
export type Hint = readonly [key: string, does: string];

/** What the keys that move you do where they are, for the last line. */
export interface KeysHere {
  /** There is an input: Enter sends, and a slash starts a command. */
  send: boolean;
  /** There are rows to choose and open. */
  choose: boolean;
  /** Left and Esc go back a level. */
  back: boolean;
  /** Something is typed in the input, which Left crosses before it goes back. */
  typed: boolean;
  /** The keys are in the first level, where Ctrl+D is how to leave. */
  first: boolean;
}

/**
 * The last line: the keys that move you from where the keys are, then the list
 * of every key. While something is typed, the key that goes back at once is
 * Esc, since Left crosses what is typed first.
 */
export function keyHints(here: KeysHere): Hint[] {
  const hints: Hint[] = [];
  if (here.send) hints.push(["enter", "send"], ["/", "commands"]);
  if (here.choose) hints.push(["↑↓", "choose"], ["→", "open"]);
  if (here.back) hints.push([here.typed ? "esc" : "←", "back"]);
  hints.push(["ctrl+g", "keys"]);
  if (here.first) hints.push(["ctrl+d", "quit"]);
  return hints;
}

/** The last line while the list of keys is open. */
export const CLOSE_KEYS: Hint = ["esc", "close"];

/** The title of the list of keys. */
export const KEYS_TITLE = "keys";

/** The list of every key, in groups: a group's name, then its keys. */
export const ALL_KEYS: readonly (readonly [group: string, keys: readonly Hint[]])[] = [
  [
    "moving",
    [
      ["↑ ↓", "choose"],
      ["→", "open what is chosen"],
      ["← esc", "back a level"],
      ["tab", "the other view: yours, or the agent's"],
      ["ctrl+n", "a new thread"],
    ],
  ],
  [
    "in a thread",
    [
      ["enter", "send what is typed"],
      ["←", "through what is typed, then back"],
      ["esc", "back, whatever is typed"],
      ["/", "commands, and esc closes their list"],
      ["ctrl+o", "tool calls in full, and back to brief"],
      ["ctrl+t", "thinking in full, and back to brief"],
      ["pgup pgdn", "scroll, as the wheel does"],
      ["ctrl+shift+f", "search the thread, and esc closes it"],
    ],
  ],
  [
    "the screen",
    [
      ["ctrl+\\", "side by side, or one level at a time"],
      ["ctrl+g", "this list, and esc closes it"],
      ["ctrl+c", "clear what is typed. Twice quits"],
      ["ctrl+d", "quit when nothing is typed"],
    ],
  ],
];

export const QUIT_AGAIN = "Press Ctrl+C again to quit.";

/** Beside a list a thread can be started from, wide and narrow. */
export const NEW_THREAD: Hint = ["ctrl+n", "new thread"];
export const NEW: Hint = ["ctrl+n", "new"];

/** Beside the two views of an agent's list. */
export const FILTER_KEY = "tab";

/**
 * Beside a thread with agents' views of the session behind it: where Tab goes
 * from the view on show, which is `at` of `count`, 0 being the conversation.
 */
export function turnHint(count: number, at: number): Hint {
  if (at === 0) return ["tab", count > 1 ? "agents' views" : "agent's view"];
  if (at < count) return ["tab", `next view · ${String(at)} of ${String(count)}`];
  return ["tab", "conversation"];
}

/** Beside the work an agent is doing: how tool calls and thinking are shown, and the keys that change it. */
export const inFullHints = (inFull: InFull): Hint[] => [
  ["ctrl+o", toolCallsShown(inFull.toolCalls)],
  ["ctrl+t", thinkingShown(inFull.thinking)],
];

/** On the end of a thread scrolled away from it, to click. */
export const LATEST = "↓ latest";

/** Where a thread would be while none is open, on the list of an agent the person has threads with, which can be picked or started. */
export const PICK_OR_START = "Pick a thread, or press Ctrl+N to start one.";

/** `said`, then how to start a thread: where a thread would be, or an agent's list, while the person has not talked to the agent yet. */
export const startThread = (said: string): string => `${said} Press Ctrl+N to start a thread.`;

/**
 * What an agent's list says when it is empty: `notTalked`, the views' sentence
 * that the person has not talked to the agent yet, then how to start a thread,
 * and, when `more` says the filter leaves something out, how to see everything
 * the agent, `agent` on one line, takes part in.
 */
export const emptyAgentList = (notTalked: string, agent: string, more: boolean): string =>
  `${startThread(notTalked)}${more ? ` Tab shows everything ${agent} takes part in.` : ""}`;
