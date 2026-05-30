import type { ResolvedAgentConfig } from "../config/agents.js";
import {
  DAEMON_TOOL_NAMES,
  type DaemonToolName,
} from "./names.js";

export const PI_BUILTIN_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
] as const;

export const PI_DEFAULT_ACTIVE_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
] as const;

export type PiBuiltinToolName = typeof PI_BUILTIN_TOOL_NAMES[number];

export type ToolCapabilityOrigin =
  | "pi_builtin"
  | "shrimpy_daemon"
  | "unknown";

export type ToolCapabilityStatus =
  | "active"
  | "registered"
  | "excluded";

export interface ToolCapabilityView {
  name: string;
  origin: ToolCapabilityOrigin;
  status: ToolCapabilityStatus;
  registered: boolean;
  active: boolean;
  excluded: boolean;
  defaultActive: boolean;
}

export interface AgentToolPolicy {
  agentId: string;
  daemonToolNames: DaemonToolName[];
  disabledToolNames: string[];
  registeredToolNames: string[];
  activeToolNames: string[];
  capabilities: ToolCapabilityView[];
}

export interface SessionToolPolicy {
  excludedToolNames?: string[];
}

export function resolveAgentToolPolicy(
  agent: Pick<ResolvedAgentConfig, "id" | "tools" | "disabledTools">,
): AgentToolPolicy {
  const daemonToolNames = uniqueStrings(agent.tools?.length
    ? agent.tools
    : DAEMON_TOOL_NAMES) as DaemonToolName[];
  const disabledToolNames = uniqueStrings(agent.disabledTools);
  const disabled = new Set(disabledToolNames);
  const daemon = new Set<string>(daemonToolNames);
  const names = uniqueStrings([
    ...PI_BUILTIN_TOOL_NAMES,
    ...daemonToolNames,
    ...disabledToolNames,
  ]);

  const capabilities = names.map((name): ToolCapabilityView => {
    const piBuiltin = isPiBuiltinToolName(name);
    const shrimpyDaemon = daemon.has(name);
    const registered = piBuiltin || shrimpyDaemon;
    const defaultActive = (PI_DEFAULT_ACTIVE_TOOL_NAMES as readonly string[]).includes(name) ||
      shrimpyDaemon;
    const excluded = disabled.has(name);
    const active = registered && defaultActive && !excluded;

    return {
      name,
      origin: piBuiltin
        ? "pi_builtin"
        : shrimpyDaemon
          ? "shrimpy_daemon"
          : "unknown",
      status: excluded ? "excluded" : active ? "active" : "registered",
      registered,
      active,
      excluded,
      defaultActive,
    };
  });

  return {
    agentId: agent.id,
    daemonToolNames,
    disabledToolNames,
    registeredToolNames: capabilities
      .filter((tool) => tool.registered)
      .map((tool) => tool.name),
    activeToolNames: capabilities
      .filter((tool) => tool.active)
      .map((tool) => tool.name),
    capabilities,
  };
}

export function createSessionToolPolicy(
  policy: AgentToolPolicy,
): SessionToolPolicy | undefined {
  return policy.disabledToolNames.length > 0
    ? { excludedToolNames: [...policy.disabledToolNames] }
    : undefined;
}

function isPiBuiltinToolName(value: string): value is PiBuiltinToolName {
  return (PI_BUILTIN_TOOL_NAMES as readonly string[]).includes(value);
}

function uniqueStrings(values?: readonly string[]): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}
