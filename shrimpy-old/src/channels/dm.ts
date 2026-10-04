import type { ResolvedAgentConfig } from "../config/agents.js";

const DM_PREFIX = "dm~";

export function buildAgentDmChannel(agentA: string, agentB: string): string {
  const members = [agentA.trim(), agentB.trim()].filter(Boolean);
  if (members.length !== 2) {
    throw new Error("direct message channels require exactly two agent ids");
  }
  if (members[0] === members[1]) {
    throw new Error("direct message channels require two distinct agent ids");
  }

  return `${DM_PREFIX}${members.sort((a, b) => a.localeCompare(b)).join("~")}`;
}

export function parseAgentDmChannel(channel: string): string[] | null {
  if (!channel.startsWith(DM_PREFIX)) return null;
  const members = channel.slice(DM_PREFIX.length)
    .split("~")
    .map((member) => member.trim())
    .filter(Boolean);

  if (members.length !== 2 || members[0] === members[1]) {
    return null;
  }

  return members;
}

export function resolveAgentDmRecipient(
  channel: string,
  senderActorId: string,
): string | null {
  const members = parseAgentDmChannel(channel);
  if (!members) return null;

  const senderIndex = members.findIndex(
    (member) => senderActorId === `agent:${member}`,
  );
  if (senderIndex === -1) return null;

  return members[senderIndex === 0 ? 1 : 0] ?? null;
}

export function resolveAgentDmMembers(
  channel: string,
  agents: ResolvedAgentConfig[],
): string[] | null {
  const members = parseAgentDmChannel(channel);
  if (!members) return null;

  const agentIds = new Set(agents.map((agent) => agent.id));
  return members.every((member) => agentIds.has(member)) ? members : [];
}
