import { agentMember, type Channel } from "../../contracts/chat/index.ts";

/** Your DM with the agent called `name`, among the channels you belong to, or undefined if you have none yet. */
export function dmWith(channels: Channel[], name: string): Channel | undefined {
  const { id } = agentMember(name);
  return channels.find((channel) => channel.kind === "dm" && channel.members.some((member) => member.id === id));
}
