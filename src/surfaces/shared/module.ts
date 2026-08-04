import type { ChannelBus } from "../../channels/bus.js";
import type { ChannelMembershipStore } from "../../channels/membership.js";
import type { IdentityStore } from "../../gateway/identity-store.js";
import type { WorkspacePaths } from "../../workspace/paths.js";
import type { GatewaySurface, SurfaceEgress } from "./types.js";
import type { SurfaceThreadStateStore } from "./thread-state-store.js";

/**
 * Resolved per-instance surface metadata that AppRuntime needs uniformly
 * across surface kinds (route building, channel→default-agent resolution,
 * inspection commands).
 */
export interface ResolvedSurfaceInstance {
  surfaceId: string;
  adapter: string;
  channelPrefix: string;
  defaultAgentId: string;
}

export interface SurfaceModuleResolved<TInstance extends ResolvedSurfaceInstance = ResolvedSurfaceInstance> {
  instances: TInstance[];
}

export interface SurfaceRuntime {
  paths: Pick<
    WorkspacePaths,
    "workspace" | "mediaDir" | "userPresencePath" | "gatewayStatePath"
  >;
  resolved: {
    agents: Array<{ id: string }>;
  };
  surfaceConfig(name: string): SurfaceModuleResolved;
  createChannelMembershipStore(): ChannelMembershipStore;
}

export interface ChatSurfaceModule<
  TResolved extends SurfaceModuleResolved = SurfaceModuleResolved,
> {
  /** Stable name; must match the config key (e.g. "telegram"). */
  name: string;

  /** Validate the raw subtree under `config[name]`. Throws on schema errors. */
  validateConfig(raw: unknown): void;

  /**
   * Resolve the raw subtree into typed instance configs. `agentIds` is the
   * list of known agent ids so the module can validate `defaultAgentId`
   * references at config-resolve time.
   */
  resolveConfig(raw: unknown, agentIds: string[]): TResolved;

  /** Egress-only factories (CLI sessions, child runs). */
  createEgresses(runtime: SurfaceRuntime): SurfaceEgress[];

  /** Full lifecycle factories used by the gateway. */
  createGatewaySurfaces(opts: {
    runtime: SurfaceRuntime;
    channelBus: ChannelBus;
    identityStore: IdentityStore;
    surfaceThreadStateStore: SurfaceThreadStateStore;
  }): GatewaySurface[];

  /**
   * Channel → default agent ids for membership bootstrapping. Returns an
   * empty array when the channel does not belong to this surface.
   */
  resolveDefaultAgentIds(resolved: TResolved, channel: string): string[];
}
