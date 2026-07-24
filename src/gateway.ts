#!/usr/bin/env node

/**
 * shrimpy gateway — long-running process.
 *
 * Three jobs:
 * 1. Channel adapters (Telegram polling → channel files)
 * 2. Channel watcher → SessionPool dispatch
 * 3. Watch clock (runs time-based agent-owned watches)
 * 4. Workspace checkpoint clock (optional local git checkpoints)
 */

import { loadConfig } from "./config/load.js";
import { createAppRuntime } from "./app/runtime.js";
import { applyShrimpyRuntimeProcessEnv } from "./app/environment.js";
import { IdentityStore } from "./gateway/identity-store.js";
import { installGatewayLogFile } from "./gateway/logging.js";
import {
  GatewayAlreadyRunningError,
  claimGatewayPid,
  releaseGatewayPid,
} from "./gateway/pid-file.js";
import { GatewayHealthWriter } from "./gateway/liveness.js";
import {
  createGatewayBootstraps,
  ensureGatewayDirectories,
  logGatewayStartup,
} from "./gateway/runtime-helpers.js";
import {
  startGatewayWatchClock,
} from "./gateway/watch-service.js";
import { saveWatchClockState } from "./watches/clock-state.js";
import { createWorkspaceCheckpointService } from "./workspace/checkpoints/scheduler.js";
import { ChannelDeliveryLoop } from "./gateway/channel-delivery-loop.js";
import {
  createConfiguredGatewaySurfaces,
  registerSurfaceEgresses,
} from "./surfaces/registry.js";
import { ChannelOutbox } from "./channels/outbox.js";
import { extractGlobalWorkspace } from "./workspace/location.js";

async function run() {
  extractGlobalWorkspace(process.argv.slice(2));

  const config = loadConfig();
  applyShrimpyRuntimeProcessEnv(config.workspace);
  const runtime = createAppRuntime(config);

  try {
    claimGatewayPid(runtime.paths.gatewayPidPath);
  } catch (err) {
    if (err instanceof GatewayAlreadyRunningError) {
      console.error(
        `[gateway] ${err.message}; refusing to start. Run 'shrimpy gateway restart' to replace it.`,
      );
    } else {
      console.error("[gateway] unable to claim workspace ownership:", err);
    }
    process.exit(1);
  }
  ensureGatewayDirectories(runtime);
  const health = new GatewayHealthWriter(runtime.paths.gatewayHealthPath, {
    pid: process.pid,
    workspace: runtime.paths.workspace,
    appCheckout: runtime.environment.appRoot,
  });

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
  const updateHealth = () => health.setSurfaces(Object.fromEntries(
    surfaces.map((surface) => [surface.name, surface.health?.() ?? {
      status: "starting",
      consecutiveFailures: 0,
      stallRestartCount: 0,
    }]),
  ));
  health.setSurfaceProvider(() => Object.fromEntries(
    surfaces.map((surface) => [surface.name, surface.health?.() ?? {
      status: "starting",
      consecutiveFailures: 0,
      stallRestartCount: 0,
    }]),
  ));
  registerSurfaceEgresses(egressRegistry, surfaces);
  const outbox = new ChannelOutbox({
    channelBus,
    memberships: runtime.createChannelMembershipStore(),
    egressRegistry,
    cursorsPath: runtime.paths.outboxCursorsPath,
    receiptsPath: runtime.paths.outboundReceiptsPath,
  });
  const bootstraps = await createGatewayBootstraps(runtime);
  const deliveryLoop = new ChannelDeliveryLoop({
    runtime,
    bootstraps,
    channelBus,
  });
  for (const surface of surfaces) {
    surface.start();
  }
  updateHealth();
  health.start();

  await outbox.drainBacklog();
  outbox.start();
  await deliveryLoop.drainBacklog();
  deliveryLoop.start();

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
    await Promise.allSettled(surfaces.map(async (surface) => surface.stop()));
    updateHealth();
    health.stop();
    await outbox.stop();
    await deliveryLoop.stop();

    releaseGatewayPid(runtime.paths.gatewayPidPath, process.pid);

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

run().catch((err: unknown) => {
  console.error("[gateway] fatal:", err);
  process.exit(1);
});
