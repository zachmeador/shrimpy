import type { EgressRegistry } from "../../channels/egress.js";
import type {
  AdapterRouteConfigEntry,
  ResolvedAdapterRoutingConfig,
} from "../../config/adapter-routing.js";

export interface SurfaceEgress {
  adapter: string;
  registerRoute(
    registry: EgressRegistry,
    route: AdapterRouteConfigEntry,
  ): void;
}

export interface GatewaySurface extends SurfaceEgress {
  name: string;
  start(): void;
  stop(): void | Promise<void>;
}

export function registerSurfaceRoutes(
  registry: EgressRegistry,
  routing: ResolvedAdapterRoutingConfig,
  surfaces: SurfaceEgress[],
): void {
  const surfaceByAdapter = new Map(
    surfaces.map((surface) => [surface.adapter, surface] as const),
  );

  for (const route of routing.routes) {
    const surface = surfaceByAdapter.get(route.adapter);
    if (!surface) {
      console.warn(
        `[surfaces] no surface registered for adapter route "${route.adapter}"`,
      );
      continue;
    }
    surface.registerRoute(registry, route);
  }
}
