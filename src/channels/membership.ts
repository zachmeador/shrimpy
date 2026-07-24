import {
  DEFAULT_AGENT_ID,
  type ResolvedAgentConfig,
} from "../config/agents.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { buildAgentDmChannel, resolveAgentDmMembers } from "./dm.js";
import {
  deriveChannelManifest,
  normalizeChannelManifest,
  type ChannelManifest,
} from "./manifest.js";
import { parseChannelName } from "./names.js";

interface ChannelMembershipsFile {
  channels: Record<string, ChannelConfigEntry>;
}

interface ChannelConfigEntry {
  agents: Record<string, ChannelAgentMembership>;
  manifest?: ChannelManifest;
}

export interface ChannelMembership {
  agents: Record<string, ChannelAgentMembership>;
}

type ChannelAgentMembership = Record<string, never>;

interface ChannelMembershipStoreOptions {
  defaultAgentIdsForChannel?: (channel: string) => string[];
}

const EMPTY_MEMBERSHIP: ChannelMembership = {
  agents: {},
};

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function defaultAgentMembership(): ChannelAgentMembership {
  return {};
}

function isAgentMembership(value: unknown): value is ChannelAgentMembership {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeAgentMembership(value: unknown): ChannelAgentMembership {
  if (!isAgentMembership(value)) return defaultAgentMembership();
  return {};
}

function normalizeMembership(value: unknown): ChannelMembership {
  return normalizeChannelConfigEntry(value);
}

function normalizeChannelConfigEntry(value: unknown): ChannelConfigEntry {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

  const agents = typeof record.agents === "object" && record.agents !== null && !Array.isArray(record.agents)
    ? Object.fromEntries(
      Object.entries(record.agents as Record<string, unknown>)
        .map(([agentId, membership]) => [
          agentId.trim(),
          normalizeAgentMembership(membership),
        ])
        .filter(([agentId]) => Boolean(agentId)),
    )
    : {};

  const manifest = normalizeChannelManifest(record.manifest);
  return {
    agents,
    ...(manifest ? { manifest } : {}),
  };
}

function membershipOnly(entry: ChannelConfigEntry): ChannelMembership {
  return { agents: { ...entry.agents } };
}

export function readChannelMemberships(path: string): ChannelMembershipsFile {
  return readJsonFile(path, () => ({ channels: {} }), (parsed) => {
    const channels = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).channels
      : undefined;

    if (typeof channels !== "object" || channels === null || Array.isArray(channels)) {
      return { channels: {} };
    }

    return {
      channels: Object.fromEntries(
        Object.entries(channels).map(([channel, value]) => [
          channel,
          normalizeChannelConfigEntry(value),
        ]),
      ),
    };
  });
}

export function writeChannelMemberships(
  path: string,
  memberships: ChannelMembershipsFile,
): void {
  writeJsonFileAtomic(path, memberships);
}

export function defaultChannelMembers(
  channel: string,
  agents: ResolvedAgentConfig[],
  opts?: ChannelMembershipStoreOptions,
): ChannelMembership {
  const directMessageMembers = resolveAgentDmMembers(channel, agents);
  if (directMessageMembers) {
    return {
      agents: Object.fromEntries(
        directMessageMembers.map((agentId) => [
          agentId,
          defaultAgentMembership(),
        ]),
      ),
    };
  }

  if (channel === "home") {
    const defaultAgent = agents.find((agent) => agent.id === DEFAULT_AGENT_ID) ?? agents[0];
    return {
      agents: defaultAgent
        ? { [defaultAgent.id]: defaultAgentMembership() }
        : {},
    };
  }

  const surfaceDefaultAgents = opts?.defaultAgentIdsForChannel?.(channel) ?? [];

  return {
    agents: Object.fromEntries(
      uniqueStrings(surfaceDefaultAgents).map((agentId) => [
        agentId,
        defaultAgentMembership(),
      ]),
    ),
  };
}

export function channelAgentIds(membership: ChannelMembership): string[] {
  return Object.keys(membership.agents).sort();
}

export function ensureChannelMembership(
  memberships: ChannelMembershipStore,
  channel: string,
): ChannelMembership {
  return memberships.seedChannel(channel);
}

export function ensureDirectMessageChannel(
  memberships: ChannelMembershipStore,
  agentA: string,
  agentB: string,
): {
  channel: string;
  membership: ChannelMembership;
} {
  const channel = buildAgentDmChannel(agentA, agentB);
  return {
    channel,
    membership: memberships.seedChannel(channel),
  };
}

export function updateChannelMembership(
  memberships: ChannelMembershipStore,
  input: {
    action: "join" | "leave";
    channel: string;
    agentId: string;
  },
): ChannelMembership {
  return input.action === "join"
    ? memberships.addAgent(input.channel, input.agentId)
    : memberships.removeAgent(input.channel, input.agentId);
}

export class ChannelMembershipStore {
  constructor(
    private readonly path: string,
    private readonly agents: ResolvedAgentConfig[],
    private readonly opts?: ChannelMembershipStoreOptions,
  ) {}

  read(): ChannelMembershipsFile {
    return readChannelMemberships(this.path);
  }

  write(memberships: ChannelMembershipsFile): void {
    writeChannelMemberships(this.path, memberships);
  }

  listChannels(): string[] {
    return [...new Set(["home", ...Object.keys(this.read().channels)])].sort();
  }

  get(channel: string): ChannelMembership | null {
    const name = parseChannelName(channel);
    const membership = this.read().channels[name];
    return membership ? membershipOnly(membership) : null;
  }

  seedChannel(channel: string): ChannelMembership {
    const name = parseChannelName(channel);
    const memberships = this.read();
    const existing = memberships.channels[name];
    if (existing) {
      if (!existing.manifest) {
        existing.manifest = deriveChannelManifest(name);
        this.write(memberships);
      }
      return membershipOnly(existing);
    }

    const seeded = defaultChannelMembers(name, this.agents, this.opts);
    memberships.channels[name] = {
      ...seeded,
      manifest: deriveChannelManifest(name),
    };
    this.write(memberships);
    return membershipOnly(seeded);
  }

  getManifest(channel: string): ChannelManifest {
    const name = parseChannelName(channel);
    const memberships = this.read();
    const existing = memberships.channels[name];
    if (existing?.manifest) return { ...existing.manifest };

    const manifest = deriveChannelManifest(name);
    memberships.channels[name] = {
      ...(existing ?? normalizeMembership(EMPTY_MEMBERSHIP)),
      manifest,
    };
    this.write(memberships);
    return { ...manifest };
  }

  setManifest(channel: string, manifest: ChannelManifest): ChannelManifest {
    const name = parseChannelName(channel);
    const memberships = this.read();
    const existing = memberships.channels[name] ?? normalizeMembership(EMPTY_MEMBERSHIP);
    memberships.channels[name] = {
      ...existing,
      manifest: { ...manifest },
    };
    this.write(memberships);
    return { ...manifest };
  }

  bindChannel(
    channel: string,
    binding: NonNullable<ChannelManifest["binding"]>,
  ): ChannelManifest {
    const current = this.getManifest(channel);
    return this.setManifest(channel, {
      ...current,
      binding: { ...binding },
    });
  }

  unbindChannel(channel: string): ChannelManifest {
    const current = this.getManifest(channel);
    const { binding: _binding, ...rest } = current;
    return this.setManifest(channel, rest);
  }

  listAgentIds(channel: string): string[] {
    return channelAgentIds(this.seedChannel(channel));
  }

  addAgent(channel: string, agentId: string): ChannelMembership {
    const name = parseChannelName(channel);
    const memberships = this.read();
    const membership = normalizeMembership(
      memberships.channels[name] ?? EMPTY_MEMBERSHIP,
    );
    membership.agents[agentId] = membership.agents[agentId] ?? defaultAgentMembership();
    memberships.channels[name] = {
      ...membership,
      manifest: memberships.channels[name]?.manifest ?? deriveChannelManifest(name),
    };
    this.write(memberships);
    return membershipOnly(membership);
  }

  removeAgent(channel: string, agentId: string): ChannelMembership {
    const name = parseChannelName(channel);
    if (name === "home" && agentId === DEFAULT_AGENT_ID) {
      throw new Error("cannot remove shrimpy from home");
    }

    const memberships = this.read();
    const membership = normalizeMembership(
      memberships.channels[name] ?? EMPTY_MEMBERSHIP,
    );
    delete membership.agents[agentId];
    memberships.channels[name] = {
      ...membership,
      manifest: memberships.channels[name]?.manifest ?? deriveChannelManifest(name),
    };
    this.write(memberships);
    return membershipOnly(membership);
  }

  removeAgentEverywhere(agentId: string): string[] {
    if (agentId === DEFAULT_AGENT_ID) {
      throw new Error("cannot remove shrimpy from home");
    }

    const memberships = this.read();
    const updatedChannels: string[] = [];

    for (const [channel, membershipValue] of Object.entries(memberships.channels)) {
      const membership = normalizeMembership(membershipValue);
      if (!(agentId in membership.agents)) continue;

      delete membership.agents[agentId];
      memberships.channels[channel] = {
        ...membership,
        manifest: memberships.channels[channel]?.manifest,
      };
      updatedChannels.push(channel);
    }

    if (updatedChannels.length > 0) {
      this.write(memberships);
    }

    return updatedChannels.sort();
  }

  renameAgentEverywhere(fromAgentId: string, toAgentId: string): string[] {
    if (fromAgentId === DEFAULT_AGENT_ID) {
      throw new Error("cannot rename default agent memberships");
    }

    const memberships = this.read();
    const updatedChannels: string[] = [];

    for (const [channel, membershipValue] of Object.entries(memberships.channels)) {
      const membership = normalizeMembership(membershipValue);
      const existing = membership.agents[fromAgentId];
      if (!existing) continue;

      delete membership.agents[fromAgentId];
      membership.agents[toAgentId] = existing;
      memberships.channels[channel] = {
        ...membership,
        manifest: memberships.channels[channel]?.manifest,
      };
      updatedChannels.push(channel);
    }

    if (updatedChannels.length > 0) {
      this.write(memberships);
    }

    return updatedChannels.sort();
  }
}
