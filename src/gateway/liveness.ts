import { existsSync, readFileSync } from "node:fs";
import { writeJsonFileAtomic } from "../util/json-file.js";
import {
  claimGatewayPid,
  isAlive,
  isExpectedGatewayProcess,
  readPidFile,
  releaseGatewayPid,
  type GatewayClaimOptions,
} from "./pid-file.js";
import type { GatewayServiceStatus } from "./service/index.js";
import type { SurfaceHealthSnapshot } from "../surfaces/shared/types.js";

export interface GatewayHealthRecord {
  version: 1;
  pid: number;
  workspace: string;
  appCheckout: string;
  gatewayStartedAt: number;
  heartbeatAt: number;
  surfaces: Record<string, SurfaceHealthSnapshot>;
}

export type GatewayProcessState = "running" | "stale" | "mismatched" | "stopped";

export interface GatewayLiveness {
  process: GatewayProcessState;
  pid: number | null;
  heartbeat: "fresh" | "stale" | "missing";
  service: GatewayServiceStatus;
  managementMismatch: boolean;
  runtime?: GatewayHealthRecord;
  surfaces: Record<string, SurfaceHealthSnapshot>;
  warnings: string[];
}

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 2_000;
export const DEFAULT_HEARTBEAT_MAX_AGE_MS = 15_000;

export function loadGatewayHealth(path: string): GatewayHealthRecord | undefined {
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, "utf-8")) as Partial<GatewayHealthRecord>;
    if (value.version !== 1 || typeof value.pid !== "number" || typeof value.workspace !== "string" || typeof value.appCheckout !== "string" || typeof value.gatewayStartedAt !== "number" || typeof value.heartbeatAt !== "number") return undefined;
    return {
      version: 1,
      pid: value.pid,
      workspace: value.workspace,
      appCheckout: value.appCheckout,
      gatewayStartedAt: value.gatewayStartedAt,
      heartbeatAt: value.heartbeatAt,
      surfaces: value.surfaces && typeof value.surfaces === "object" ? value.surfaces as Record<string, SurfaceHealthSnapshot> : {},
    };
  } catch {
    return undefined;
  }
}

export class GatewayHealthWriter {
  private readonly startedAt = Date.now();
  private timer: ReturnType<typeof setInterval> | undefined;
  private surfaces: Record<string, SurfaceHealthSnapshot> = {};
  private surfaceProvider?: () => Record<string, SurfaceHealthSnapshot>;

  constructor(
    private readonly path: string,
    private readonly identity: { pid: number; workspace: string; appCheckout: string },
    private readonly intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  ) {}

  setSurfaces(surfaces: Record<string, SurfaceHealthSnapshot>): void {
    this.surfaces = structuredClone(surfaces);
  }

  setSurfaceProvider(provider: () => Record<string, SurfaceHealthSnapshot>): void {
    this.surfaceProvider = provider;
  }

  beat(): void {
    writeJsonFileAtomic(this.path, {
      version: 1,
      ...this.identity,
      gatewayStartedAt: this.startedAt,
      heartbeatAt: Date.now(),
      surfaces: this.surfaceProvider?.() ?? this.surfaces,
    } satisfies GatewayHealthRecord);
  }

  start(): void {
    this.beat();
    this.timer = setInterval(() => this.beat(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.beat();
  }
}

export function collectGatewayLiveness(input: {
  pidPath: string;
  healthPath: string;
  workspace: string;
  appCheckout: string;
  service: GatewayServiceStatus;
  now?: number;
  maxHeartbeatAgeMs?: number;
  lookup?: GatewayClaimOptions;
}): GatewayLiveness {
  const now = input.now ?? Date.now();
  const runtime = loadGatewayHealth(input.healthPath);
  const pid = readPidFile(input.pidPath);
  const alive = pid !== null && (input.lookup?.isAlive ?? isAlive)(pid);
  const expected = alive && isExpectedGatewayProcess(pid!, input.lookup);
  const heartbeat = runtime === undefined
    ? "missing"
    : now - runtime.heartbeatAt <= (input.maxHeartbeatAgeMs ?? DEFAULT_HEARTBEAT_MAX_AGE_MS)
      ? "fresh"
      : "stale";
  let process: GatewayProcessState = "stopped";
  if (pid !== null && !alive) process = "stale";
  else if (alive && !expected) process = "mismatched";
  else if (alive && runtime && (runtime.pid !== pid || runtime.workspace !== input.workspace || runtime.appCheckout !== input.appCheckout)) process = "mismatched";
  else if (alive && heartbeat !== "fresh") process = "stale";
  else if (alive) process = "running";

  const warnings: string[] = [];
  if (process === "mismatched") warnings.push("a live PID does not identify the expected workspace gateway");
  if (process === "stale") warnings.push(heartbeat === "stale" ? "gateway heartbeat is stale" : "gateway heartbeat is missing");
  const managementMismatch = input.service.manager !== "manual" && input.service.active !== "active";
  if (managementMismatch && process === "running") warnings.push(`gateway process is running while ${input.service.manager} reports ${input.service.active}`);
  return {
    process,
    pid,
    heartbeat,
    service: input.service,
    managementMismatch,
    ...(runtime ? { runtime } : {}),
    surfaces: runtime?.surfaces ?? {},
    warnings,
  };
}

export { claimGatewayPid, releaseGatewayPid };
