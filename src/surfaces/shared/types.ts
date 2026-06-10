import type { EgressRegistry } from "../../channels/egress.js";

export interface SurfaceEgress {
  adapter: string;
  registerEgress(registry: EgressRegistry): void;
}

export interface GatewaySurface extends SurfaceEgress {
  name: string;
  start(): void;
  stop(): void | Promise<void>;
}

export function registerSurfaceEgresses(
  registry: EgressRegistry,
  surfaces: SurfaceEgress[],
): void {
  for (const surface of surfaces) {
    surface.registerEgress(registry);
  }
}
