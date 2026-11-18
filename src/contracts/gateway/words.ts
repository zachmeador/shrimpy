import { oneLine } from "../../lib/plain/index.ts";

/*
 * What every client tells a person to start when a program it needs isn't
 * linked to the gateway: the gateway itself, the chat server or an agent, each
 * with the command that starts it and the one that starts everything. The
 * commands and the terminal say it the same way, and each frames it its own
 * way. A name or a path is put on one line and made harmless here.
 */

/** The command that starts everything a conversation needs: the gateway, the chat server and the agents. */
const START_EVERYTHING = "shrimpy up";

/** How to start a program with `command`, or everything: "one" of a kind there is none of, or "it", the one named. */
const startWith = (what: "one" | "it", command: string): string =>
  `Start ${what} with: ${command}, or start everything with: ${START_EVERYTHING}`;

/** That no gateway is running on the machine of whoever says it. */
export const GATEWAY_NOT_RUNNING = "No gateway is running on this machine.";

/** That no gateway is running on this machine, and how to start Shrimpy. */
export const NO_GATEWAY = `${GATEWAY_NOT_RUNNING} Start Shrimpy with: ${START_EVERYTHING}`;

/** That no chat server is linked to this machine's gateway, and how to start one. */
export const NO_CHAT_SERVER = `No chat server is linked to this machine's gateway. ${startWith("one", "shrimpy chat serve <data-dir>")}`;

/** That no agent has joined the roster yet, and how to start one. */
export const NO_AGENT_YET = `No agent has joined yet. ${startWith("one", "shrimpy agent serve <agent>")}`;

/**
 * How to start the agent called `name`, which is on the roster and not linked:
 * here, or, when `home` says the Shrimpy folder here has no home for it, where
 * it lives, since an agent can live on another machine or under another user,
 * where nothing here can start it.
 */
export function howToStartAgent(name: string, home?: { found: boolean; where: string }): string {
  return home?.found === false
    ? `It has no home in ${oneLine(home.where)}, so it lives somewhere else: start it where it lives.`
    : startWith("it", `shrimpy agent serve ${oneLine(name)}`);
}
