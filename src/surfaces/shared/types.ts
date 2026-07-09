import type { EgressRegistry } from "../../channels/egress.js";

export type SurfaceHealthStatus = "starting" | "healthy" | "retrying" | "stalled" | "stopped";

export interface SurfaceHealthSnapshot {
  status: SurfaceHealthStatus;
  lastCompletedPollAt?: number;
  lastReceivedUpdateAt?: number;
  consecutiveFailures: number;
  lastError?: string;
  stallRestartCount: number;
}

export interface SurfaceEgress {
  adapter: string;
  registerEgress(registry: EgressRegistry): void;
}

export interface GatewaySurface extends SurfaceEgress {
  name: string;
  start(): void;
  stop(): void | Promise<void>;
  health?(): SurfaceHealthSnapshot;
}

export function registerSurfaceEgresses(
  registry: EgressRegistry,
  surfaces: SurfaceEgress[],
): void {
  for (const surface of surfaces) {
    surface.registerEgress(registry);
  }
}
