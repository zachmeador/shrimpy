import type { ChatClient, Member } from "../../contracts/chat/index.ts";
import type { GatewayConnection, RosterEntry } from "../../contracts/gateway/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import * as words from "./words.ts";

/**
 * The agent the model named, from the roster, or why it can't be asked, in words
 * for the model: nobody is called that, it is a person, or it is `self`. A name
 * is matched whatever the case.
 */
export async function agentNamed(
  gateway: GatewayConnection | undefined,
  name: string,
  self: Member,
): Promise<{ agent: RosterEntry } | { problem: string }> {
  const roster = await rosterOf(gateway);
  if (roster === undefined) return { problem: words.noRoster(name) };
  const wanted = name.toLowerCase();
  const found = roster.find((each) => each.name.toLowerCase() === wanted);
  if (found === undefined) {
    const agents = roster.filter((each) => each.kind === "agent" && each.id !== self.id).map((each) => each.name);
    return { problem: words.nobody(name, agents) };
  }
  if (found.id === self.id) return { problem: words.yourself(found.name) };
  if (found.kind === "person") return { problem: words.aPerson(found.name) };
  return { agent: found };
}

/** The main thread of the agent's DM with `agent`, made if there is no DM yet. */
export async function dmThreadWith(
  chat: ChatClient,
  agent: RosterEntry,
  signal: AbortSignal,
): Promise<{ threadId: string } | { problem: string }> {
  const channel = await chat.openDm(agent.id, signal);
  const main = (await chat.threads(channel.id, signal)).find((thread) => thread.main);
  return main === undefined ? { problem: words.noMainThread(agent.name) } : { threadId: main.id };
}

/** Everyone on the roster, or undefined when the gateway cannot be asked. */
async function rosterOf(gateway: GatewayConnection | undefined): Promise<RosterEntry[] | undefined> {
  if (gateway === undefined) return undefined;
  try {
    return await gateway.members();
  } catch (error) {
    // A connection that drops while asking is the gateway being unreachable too.
    if (isDisconnected(error)) return undefined;
    throw error;
  }
}
