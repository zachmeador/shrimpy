import type { AppRuntime } from "../app/runtime.js";
import {
  createWorkspaceCheckpoint,
  inspectWorkspaceCheckpointStatus,
  type WorkspaceCheckpointResult,
} from "./git.js";

export const DEFAULT_WORKSPACE_CHECKPOINT_INTERVAL_MS = 15 * 60 * 1000;

interface WorkspaceCheckpointService {
  start(): void;
  stop(): void;
  tick(now?: Date): WorkspaceCheckpointResult | null;
}

export function createWorkspaceCheckpointService(runtime: AppRuntime, opts?: {
  intervalMs?: number;
  logger?: Pick<Console, "log" | "warn" | "error">;
}): WorkspaceCheckpointService {
  const intervalMs = opts?.intervalMs ?? DEFAULT_WORKSPACE_CHECKPOINT_INTERVAL_MS;
  const logger = opts?.logger ?? console;
  let timer: ReturnType<typeof setInterval> | null = null;

  function tick(now = new Date()): WorkspaceCheckpointResult | null {
    const status = inspectWorkspaceCheckpointStatus(runtime.paths.workspace);
    if (!status.enabled) return null;
    if (status.diagnostics.length > 0) {
      logger.warn(`[workspace-checkpoint] ${status.diagnostics.join("; ")}`);
      return null;
    }
    if (status.changedPaths.length === 0) return null;

    const result = createWorkspaceCheckpoint(runtime.paths.workspace, {
      message: `checkpoint: automatic ${now.toISOString()}`,
    });
    if (result.created) {
      logger.log(`[workspace-checkpoint] ${result.commit} ${result.changedPaths.length} path(s)`);
    }
    return result;
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        try {
          tick();
        } catch (err) {
          logger.error("[workspace-checkpoint] automatic checkpoint failed:", err);
        }
      }, intervalMs);
      timer.unref();
      logger.log(`[workspace-checkpoint] started (tick ${Math.round(intervalMs)}ms)`);
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      logger.log("[workspace-checkpoint] stopped");
    },

    tick,
  };
}
