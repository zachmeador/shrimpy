import { agentMember, type ChatClient } from "../../../contracts/chat/index.ts";
import type { Dm } from "./model.ts";

/** The person's DM with each of `agents` that they have one with, and their threads in it. An agent they have not talked to has none. */
export async function readDms(chat: ChatClient, agents: string[]): Promise<Record<string, Dm>> {
  const channels = await chat.channels();
  const dms: Record<string, Dm> = {};
  for (const name of agents) {
    const { id } = agentMember(name);
    const channel = channels.find(
      (candidate) => candidate.kind === "dm" && candidate.members.some((member) => member.id === id),
    );
    if (channel !== undefined) dms[name] = { channel, threads: await chat.threads(channel.id) };
  }
  return dms;
}
