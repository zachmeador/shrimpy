#!/usr/bin/env node

/**
 * shrimpy gateway — long-running process.
 *
 * Three jobs:
 * 1. Channel adapters (Telegram polling → channel files)
 * 2. Channel watcher → SessionRegistry dispatch
 * 3. Watch clock (runs time-based agent-owned watches)
 * 4. Workspace checkpoint clock (optional local git checkpoints)
 */

import { loadConfig } from "./config/index.js";
import { createAppRuntime } from "./app/index.js";
import { IdentityStore } from "./gateway/identity-store.js";
import { installGatewayLogFile } from "./gateway/logging.js";
import {
  findRunningGatewayPid,
  readPidFile,
  removePidFile,
  writePidFile,
} from "./gateway/pid-file.js";
import {
  createGatewayBootstraps,
  ensureGatewayDirectories,
  logGatewayStartup,
} from "./gateway/runtime-helpers.js";
import {
  ensureGatewayWatchFiles,
  startGatewayWatchClock,
} from "./gateway/watch-service.js";
import { saveWatchClockState } from "./watches/index.js";
import { createWorkspaceCheckpointService } from "./workspace-checkpoints/index.js";
import { ChannelDeliveryLoop } from "./delivery/channel-delivery-loop.js";
import {
  createConfiguredGatewaySurfaces,
  registerSurfaceRoutes,
} from "./surfaces/index.js";

async function run() {
  const config = loadConfig();
  const runtime = createAppRuntime(config);

  const existingPid = findRunningGatewayPid(runtime.paths.gatewayPidPath);
  if (existingPid !== null) {
    console.error(
      `[gateway] another gateway is already running (PID ${existingPid}); refusing to start. Run 'shrimpy gateway restart' to replace it.`,
    );
    process.exit(1);
  }
  ensureGatewayDirectories(runtime);
  writePidFile(runtime.paths.gatewayPidPath, process.pid);

  installGatewayLogFile(runtime.paths.gatewayLogPath);
  logGatewayStartup(runtime);
  const identityStore = new IdentityStore(runtime.paths.usersPath);
  const surfaceThreadStateStore = runtime.createSurfaceThreadStateStore();

  const egressRegistry = runtime.createEgressRegistry();
  const channelBus = runtime.createChannelBus({ egressRegistry });
  const surfaces = createConfiguredGatewaySurfaces({
    runtime,
    channelBus,
    identityStore,
    surfaceThreadStateStore,
  });
  registerSurfaceRoutes(egressRegistry, runtime.resolved.adapterRouting, surfaces);
  const bootstraps = await createGatewayBootstraps(runtime);
  const deliveryLoop = new ChannelDeliveryLoop({
    runtime,
    bootstraps,
    channelBus,
  });
  for (const surface of surfaces) {
    surface.start();
  }

  await deliveryLoop.drainBacklog();
  deliveryLoop.start();

  ensureGatewayWatchFiles(runtime);
  const watchClock = startGatewayWatchClock(runtime, channelBus);
  const workspaceCheckpointService = createWorkspaceCheckpointService(runtime);
  workspaceCheckpointService.start();

  let shuttingDown = false;
  async function shutdown(signal: string) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[gateway] ${signal} received, shutting down...`);

    watchClock.stop();
    workspaceCheckpointService.stop();
    saveWatchClockState(runtime.paths.watchClockStatePath, watchClock.getState());
    await Promise.allSettled(surfaces.map((surface) => surface.stop()));
    await deliveryLoop.stop();

    if (readPidFile(runtime.paths.gatewayPidPath) === process.pid) {
      removePidFile(runtime.paths.gatewayPidPath);
    }

    console.log("[gateway] shutdown complete");
    process.exit(0);
  }

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });

  console.log("[gateway] started");
}

run().catch((err) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});
