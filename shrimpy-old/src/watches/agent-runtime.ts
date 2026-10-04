import type { AppRuntime } from "../app/runtime.js";
import {
  loadAgentWatchDefinitions,
  resolveAgentWatchDefinition,
  type ResolvedAgentWatchDefinition,
} from "./schema.js";

export function loadRuntimeAgentWatches(
  runtime: AppRuntime,
): ResolvedAgentWatchDefinition[] {
  const watches: ResolvedAgentWatchDefinition[] = [];
  const seen = new Set<string>();

  for (const agent of runtime.resolved.agents) {
    const path = runtime.getAgentPaths(agent.id).watchesPath;
    const agentWatches = loadAgentWatchDefinitions(path);
    for (const watch of agentWatches) {
      const resolved = resolveAgentWatchDefinition(agent.id, watch);
      if (seen.has(resolved.id)) {
        throw new Error(`duplicate resolved watch id: ${resolved.id}`);
      }
      seen.add(resolved.id);
      watches.push(resolved);
    }
  }

  return watches;
}

export function loadRuntimeAgentWatchesForAgent(
  runtime: AppRuntime,
  agentId: string,
): ResolvedAgentWatchDefinition[] {
  const agent = runtime.getAgent(agentId);
  const path = runtime.getAgentPaths(agent.id).watchesPath;
  const seen = new Set<string>();
  return loadAgentWatchDefinitions(path).map((watch) => {
    const resolved = resolveAgentWatchDefinition(agent.id, watch);
    if (seen.has(resolved.id)) {
      throw new Error(`duplicate resolved watch id: ${resolved.id}`);
    }
    seen.add(resolved.id);
    return resolved;
  });
}

export function loadRuntimeWatchIds(runtime: AppRuntime): string[] {
  return runtime.resolved.agents.flatMap((agent) => {
    try {
      return loadRuntimeAgentWatchesForAgent(runtime, agent.id)
        .map((watch) => watch.id);
    } catch {
      return [];
    }
  });
}
