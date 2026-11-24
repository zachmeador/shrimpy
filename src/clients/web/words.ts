/*
 * Every sentence the page says that names one of its keys or gestures, and the
 * names of its own controls, in one place. Everything else it says comes from
 * the views the clients share.
 */

import { oneLine } from "../../lib/plain/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";

/** What the page calls itself in a sentence the views say, such as that a program runs another version of Shrimpy. */
export const SELF = "this page";

/** What the page's own buttons and switches are called. */
export const CONTROLS = {
  back: "Back",
  backToAgents: "Back to agents and rooms",
  backToConversation: "Back to the conversation",
  agentsView: "agent's view",
  closeView: "Close the agent's view",
  whoseView: "Whose view",
  send: "Send",
  commands: "Commands",
  mode: "Switch between dusk and day",
  listShows: "What the list shows",
  hide: "hide",
  join: "join",
  notify: "Tell this device when an agent writes",
  reload: "Reload",
} as const;

/** That the gateway runs a newer Shrimpy than this page, `gateway`, which a reload takes. */
export const pageOutOfDate = (gateway: string): string => `The gateway runs Shrimpy ${oneLine(gateway)}, newer than this page's ${SHRIMPY_VERSION}.`;

/** What the keys under the input do here. The line of keys is made from this, so it names only what they do. */
interface Can {
  /** Ctrl+N starts a thread. */
  newThread: boolean;
  /** Ctrl+. puts the next agent's view of the thread beside it, or over it, and after the last takes it away. */
  turnOver: boolean;
}

/** The line of keys under the input at a desk: each key that does something here, with what it does. */
export function keyHints(can: Can): { key: string; does: string }[] {
  return [
    { key: "enter", does: "send" },
    { key: "/", does: "commands" },
    ...(can.newThread ? [{ key: "ctrl+n", does: "new thread" }] : []),
    ...(can.turnOver ? [{ key: "ctrl+.", does: CONTROLS.agentsView }] : []),
    { key: "esc", does: "back" },
  ];
}

export const NEW_THREAD = "New thread · ctrl+n";
export const TURN_OVER = "The agent's view · ctrl+.";
export const FOLD = "Fold the lists away · ctrl+\\";
export const UNFOLD = "Unfold the lists · ctrl+\\";

/** The key that starts a thread, as the views' sentences about starting one write it. */
export const NEW_THREAD_KEY = "Ctrl+N";
