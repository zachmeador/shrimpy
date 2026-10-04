import type { ChatClient } from "../../../contracts/chat/index.ts";
import type { AgentEntry, Dm } from "./model.ts";

/** The person's DM with each of `agents` that they have one with, and their threads in it, by the agent's name. An agent they have not talked to has none. */
export async function readDms(
  chat: ChatClient,
  agents: Pick<AgentEntry, "id" | "name">[],
): Promise<Record<string, Dm>> {
  const channels = await chat.channels();
  const dms: Record<string, Dm> = {};
  for (const { id, name } of agents) {
    const channel = channels.find(
      (candidate) => candidate.kind === "dm" && candidate.members.some((member) => member.id === id),
    );
    if (channel !== undefined) dms[name] = { channel, threads: await chat.threads(channel.id) };
  }
  return dms;
}
