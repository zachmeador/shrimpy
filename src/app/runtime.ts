import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { ChannelBus } from "../channels/bus.js";
import { EgressRegistry } from "../channels/egress.js";
import { ChannelMembershipStore } from "../channels/membership.js";
import {
  type ResolvedAdapterRoutingConfig,
  type ResolvedAgentConfig,
  type ResolvedBriefingConfig,
  type ResolvedGatewayStatusConfig,
  type RuntimeConfig,
  type ShrimpyConfig,
  type ModelSelectionConfig,
  resolveAdapterRoutingConfig,
  resolveAgentsConfig,
  resolveBriefingConfig,
  resolveGatewayStatusConfig,
  resolveRuntimeConfig,
  resolveToolRuntimeConfig,
} from "../config/index.js";
import {
  type ContextConfig,
  type PromptResourceRef,
  resolveContextConfig,
} from "../context/index.js";
import {
  createBootstrap,
  resolveModel,
  type SessionBootstrap,
} from "../sessions/index.js";
import {
  createConfiguredSurfaceEgresses,
  registerSurfaceRoutes,
  resolveSurfaceDefaultAgentIds,
  surfaceModules,
  SurfaceThreadStateStore,
} from "../surfaces/index.js";
import type { SurfaceModuleResolved } from "../surfaces/index.js";
import { buildRuntimeTools, type DaemonToolName } from "../tools/index.js";
import {
  createAgentPaths,
  createWorkspacePaths,
  type AgentPaths,
  type WorkspacePaths,
} from "./paths.js";

export interface ResolvedAppConfig {
  agents: ResolvedAgentConfig[];
  adapterRouting: ResolvedAdapterRoutingConfig;
  briefing: ResolvedBriefingConfig;
  context: Required<ContextConfig>;
  runtime: Required<RuntimeConfig>;
  status: ResolvedGatewayStatusConfig;
  surfaces: Record<string, SurfaceModuleResolved>;
  tools: ReturnType<typeof resolveToolRuntimeConfig>;
  model?: ModelSelectionConfig;
}

export interface AppRuntimeBuildToolsOpts {
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  agentId?: string;
  toolNames?: DaemonToolName[];
  actorId?: string;
}

export class AppRuntime {
  readonly config: ShrimpyConfig;
  readonly paths: WorkspacePaths;
  readonly resolved: ResolvedAppConfig;

  constructor(config: ShrimpyConfig) {
    this.config = config;
    this.paths = createWorkspacePaths(config.workspace);
    const agents = resolveAgentsConfig(config.agents);
    const agentIds = agents.map((agent) => agent.id);

    const surfaces: Record<string, SurfaceModuleResolved> = {};
    const surfaceRoutes = [];
    for (const module of surfaceModules) {
      const raw = (config as Record<string, unknown>)[module.name];
      const resolved = module.resolveConfig(raw, agentIds);
      surfaces[module.name] = resolved;
      surfaceRoutes.push(...module.buildAdapterRoutes(resolved));
    }

    this.resolved = {
      agents,
      adapterRouting: resolveAdapterRoutingConfig(config.adapters, surfaceRoutes),
      briefing: resolveBriefingConfig(config.briefing),
      context: resolveContextConfig(config.context, config.contextDefaults),
      runtime: resolveRuntimeConfig(config.runtime),
      status: resolveGatewayStatusConfig(config.status),
      surfaces,
      tools: resolveToolRuntimeConfig(config.tools),
      model: config.model,
    };
  }

  surfaceConfig<T extends SurfaceModuleResolved>(name: string): T {
    const resolved = this.resolved.surfaces[name];
    if (!resolved) {
      throw new Error(`unknown surface module "${name}"`);
    }
    return resolved as T;
  }

  async createBootstrap(opts?: {
    agentId?: string;
    appendSystemPrompt?: string;
    basePromptResources?: PromptResourceRef[];
    cwd?: string;
  }): Promise<SessionBootstrap> {
    const agent = this.getAgent(opts?.agentId);
    return createBootstrap(
      {
        config: this.config,
        agentId: agent.id,
        agentRootPath: this.getAgentPaths(agent.id).root,
        workspacePath: this.paths.workspace,
        authPath: this.paths.authPath,
        modelsPath: this.paths.modelsPath,
        contextConfig: this.resolved.context,
        runtimeConfig: this.resolved.runtime,
      },
      opts,
    );
  }

  resolveModel(
    bootstrap: SessionBootstrap,
    provider?: string,
    model?: string,
    defaultModel?: ModelSelectionConfig,
  ) {
    return resolveModel(bootstrap, provider, model, defaultModel);
  }

  createEgressRegistry(): EgressRegistry {
    return new EgressRegistry();
  }

  createCliEgressRegistry(): EgressRegistry {
    const registry = this.createEgressRegistry();
    registerSurfaceRoutes(
      registry,
      this.resolved.adapterRouting,
      createConfiguredSurfaceEgresses(this),
    );
    return registry;
  }

  createChannelBus(opts?: {
    egressRegistry?: EgressRegistry;
  }): ChannelBus {
    return new ChannelBus(this.paths.channelsDir, opts?.egressRegistry);
  }

  createChannelMembershipStore(): ChannelMembershipStore {
    return new ChannelMembershipStore(
      this.paths.channelMembershipsPath,
      this.resolved.agents,
      {
        defaultAgentIdsForChannel: (channel) =>
          resolveSurfaceDefaultAgentIds(this, channel),
      },
    );
  }

  createSurfaceThreadStateStore(): SurfaceThreadStateStore {
    return new SurfaceThreadStateStore(this.paths.surfaceStatePath);
  }

  buildRuntimeTools(opts: AppRuntimeBuildToolsOpts): ToolDefinition[] {
    return buildRuntimeTools({
      bootstrap: opts.bootstrap,
      channelBus: opts.channelBus,
      toolConfig: this.resolved.tools,
      agentId: opts.agentId,
      toolNames: opts.toolNames,
      actorId: opts.actorId,
    });
  }

  getAgent(agentId?: string): ResolvedAgentConfig {
    if (!agentId) return this.resolved.agents[0];
    const found = this.resolved.agents.find((agent) => agent.id === agentId);
    if (!found) throw new Error(`unknown agent: ${agentId}`);
    return found;
  }

  getAgentPaths(agentId?: string): AgentPaths {
    const agent = this.getAgent(agentId);
    return createAgentPaths(this.paths.workspace, agent.root);
  }
}

export function createAppRuntime(config: ShrimpyConfig): AppRuntime {
  return new AppRuntime(config);
}
