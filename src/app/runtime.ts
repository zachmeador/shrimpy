import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { ChannelBus } from "../channels/bus.js";
import { EgressRegistry } from "../channels/egress.js";
import { ChannelMembershipStore } from "../channels/membership.js";
import {
  type ResolvedAgentConfig,
  resolveAgentsConfig,
} from "../config/agents.js";
import {
  type RuntimeConfig,
  resolveRuntimeConfig,
} from "../config/runtime.js";
import {
  type ResolvedGatewayStatusConfig,
  resolveGatewayStatusConfig,
} from "../config/gateway-status.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  type ResolvedToolRuntimeConfig,
  resolveToolRuntimeConfig,
} from "../config/tools.js";
import {
  type ResolvedContextConfig,
  resolveContextConfig,
} from "../context/spec.js";
import type { PromptResourceRef } from "../context/resources.js";
import { resolveModel as resolveSessionModel } from "../sessions/models.js";
import type { SessionBootstrap } from "../sessions/bootstrap.js";
import {
  createConfiguredSurfaceEgresses,
  registerSurfaceEgresses,
  resolveSurfaceDefaultAgentIds,
  surfaceModules,
  SurfaceThreadStateStore,
} from "../surfaces/index.js";
import type { SurfaceModuleResolved } from "../surfaces/index.js";
import type { DaemonToolName } from "../tools/names.js";
import {
  resolveAgentToolPolicy as resolveAgentToolPolicyForConfig,
  type AgentToolPolicy,
  type SessionToolPolicy,
} from "../tools/policy.js";
import {
  createAgentPaths,
  createWorkspacePaths,
  type AgentPaths,
  type WorkspacePaths,
} from "./paths.js";
import {
  ensureShrimpyRuntimeEnvironment,
  type ShrimpyRuntimeEnvironment,
} from "./environment.js";

export interface ResolvedAppConfig {
  agents: ResolvedAgentConfig[];
  context: ResolvedContextConfig;
  runtime: Required<RuntimeConfig>;
  status: ResolvedGatewayStatusConfig;
  surfaces: Record<string, SurfaceModuleResolved>;
  tools: ResolvedToolRuntimeConfig;
}

interface AppRuntimeBuildToolsOpts {
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  agentId?: string;
  toolNames?: DaemonToolName[];
  toolPolicy?: SessionToolPolicy;
  actorId?: string;
  activePublicationChannel?: string;
}

export class AppRuntime {
  readonly config: ShrimpyConfig;
  readonly paths: WorkspacePaths;
  readonly environment: ShrimpyRuntimeEnvironment;
  readonly resolved: ResolvedAppConfig;

  constructor(config: ShrimpyConfig) {
    this.config = config;
    this.paths = createWorkspacePaths(config.workspace);
    this.environment = ensureShrimpyRuntimeEnvironment(config.workspace);
    const agents = resolveAgentsConfig(config.agents);
    const agentIds = agents.map((agent) => agent.id);

    const surfaces: Record<string, SurfaceModuleResolved> = {};
    for (const module of surfaceModules) {
      const raw = (config as Record<string, unknown>)[module.name];
      const resolved = module.resolveConfig(raw, agentIds);
      surfaces[module.name] = resolved;
    }

    this.resolved = {
      agents,
      context: resolveContextConfig(config.context, config.contextDefaults),
      runtime: resolveRuntimeConfig(config.runtime),
      status: resolveGatewayStatusConfig(config.status),
      surfaces,
      tools: resolveToolRuntimeConfig(config.tools),
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
    const { createBootstrap } = await import("../sessions/bootstrap.js");
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
    defaultModelPolicy?: ResolvedAgentConfig["modelPolicy"],
    opts?: Parameters<typeof resolveSessionModel>[4],
  ) {
    return resolveSessionModel(bootstrap, provider, model, defaultModelPolicy, opts);
  }

  createEgressRegistry(): EgressRegistry {
    return new EgressRegistry();
  }

  createCliEgressRegistry(): EgressRegistry {
    const registry = this.createEgressRegistry();
    registerSurfaceEgresses(
      registry,
      createConfiguredSurfaceEgresses(this),
    );
    return registry;
  }

  createChannelBus(opts?: {
    egressRegistry?: EgressRegistry;
  }): ChannelBus {
    return new ChannelBus(this.paths.channelsDir, opts?.egressRegistry, {
      memberships: this.createChannelMembershipStore(),
    });
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

  async buildRuntimeTools(opts: AppRuntimeBuildToolsOpts): Promise<ToolDefinition[]> {
    const { buildRuntimeTools } = await import("../tools/factory.js");
    return buildRuntimeTools({
      bootstrap: opts.bootstrap,
      channelBus: opts.channelBus,
      toolConfig: this.resolved.tools,
      agentId: opts.agentId,
      toolNames: opts.toolNames,
      toolPolicy: opts.toolPolicy,
      actorId: opts.actorId,
      activePublicationChannel: opts.activePublicationChannel,
      userPresencePath: this.paths.userPresencePath,
    });
  }

  resolveAgentToolPolicy(agentId?: string): AgentToolPolicy {
    return resolveAgentToolPolicyForConfig(this.getAgent(agentId));
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
