import { CronExpressionParser } from "cron-parser";
import type {
  ResolvedAgentWatchDefinition,
  WatchRunDue,
} from "./schema.js";

export interface WatchClockConfig {
  watches: ResolvedAgentWatchDefinition[];
  onRunDue: (run: WatchRunDue) => Promise<void> | void;
  tickIntervalMs?: number;
  defaultTimezone?: string;
  initialState?: WatchClockStateSnapshot;
  onStateChange?: (state: WatchClockStateSnapshot) => void;
  now?: () => number;
  logger?: Pick<Console, "log" | "warn" | "error">;
}

interface WatchClockRuntimeState {
  nextRunAtMs?: number;
}

export interface WatchClockStateEntry {
  nextRunAtMs?: number;
}

export type WatchClockStateSnapshot = Record<string, WatchClockStateEntry>;

export interface WatchClock {
  start(): void;
  stop(): void;
  tick(nowMs?: number): Promise<WatchRunDue[]>;
  getState(): WatchClockStateSnapshot;
}

const DEFAULT_TICK_INTERVAL_MS = 1_000;

function everyMsOf(watch: ResolvedAgentWatchDefinition): number | undefined {
  return "everyMs" in watch.trigger
    ? watch.trigger.everyMs
    : undefined;
}

function cronOf(watch: ResolvedAgentWatchDefinition): string | undefined {
  return "cron" in watch.trigger ? watch.trigger.cron : undefined;
}

function toRunDue(
  watch: ResolvedAgentWatchDefinition,
  fireTimeMs: number,
): WatchRunDue {
  const fireTimeIso = new Date(fireTimeMs).toISOString();
  return {
    watch,
    watchId: watch.id,
    runId: crypto.randomUUID(),
    fireTimeMs,
    fireTimeIso,
    dedupeKey: `${watch.id}:${fireTimeIso}`,
  };
}

export function createWatchClock(config: WatchClockConfig): WatchClock {
  const {
    watches,
    onRunDue,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    defaultTimezone,
    initialState,
    onStateChange,
    now = () => Date.now(),
    logger = console,
  } = config;

  const state = new Map<string, WatchClockRuntimeState>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSnapshotKey = "";

  function getState(): WatchClockStateSnapshot {
    const snapshot: WatchClockStateSnapshot = {};
    for (const [watchId, runtime] of state) {
      if (runtime.nextRunAtMs === undefined) continue;
      snapshot[watchId] = { nextRunAtMs: runtime.nextRunAtMs };
    }
    return snapshot;
  }

  function notifyStateChanged(): void {
    if (!onStateChange) return;
    const snapshot = getState();
    const snapshotKey = JSON.stringify(snapshot);
    if (snapshotKey === lastSnapshotKey) return;
    lastSnapshotKey = snapshotKey;
    onStateChange(snapshot);
  }

  if (initialState) {
    for (const [watchId, persisted] of Object.entries(initialState)) {
      if (!persisted) continue;
      state.set(watchId, {
        nextRunAtMs: persisted.nextRunAtMs,
      });
    }
    lastSnapshotKey = JSON.stringify(getState());
  }

  function ensureState(
    watch: ResolvedAgentWatchDefinition,
    currentNowMs: number,
  ): { runtime: WatchClockRuntimeState; initialized: boolean } {
    let current = state.get(watch.id);
    let initialized = false;
    if (!current) {
      current = {};
      state.set(watch.id, current);
    }

    const everyMs = everyMsOf(watch);
    if (everyMs !== undefined && !(everyMs > 0)) {
      logger.warn(
        `[watch-clock] invalid everyMs interval for watch ${watch.id}: ${everyMs}`,
      );
      return { runtime: current, initialized };
    }
    if (everyMs !== undefined && !current.nextRunAtMs) {
      current.nextRunAtMs = currentNowMs + everyMs;
      initialized = true;
    }
    if (cronOf(watch) && !current.nextRunAtMs) {
      current.nextRunAtMs = nextCronRunAtMs(watch, currentNowMs);
      initialized = true;
    }
    if (everyMs === undefined && !cronOf(watch)) {
      logger.warn(
        `[watch-clock] invalid trigger for watch ${watch.id}: expected kind=time with cron or everyMs`,
      );
    }
    return { runtime: current, initialized };
  }

  async function tick(nowMs = now()): Promise<WatchRunDue[]> {
    const dueRuns: WatchRunDue[] = [];
    let changed = false;

    for (const watch of watches) {
      if (watch.enabled === false) continue;

      const { runtime: watchState, initialized } = ensureState(watch, nowMs);
      if (initialized) changed = true;

      const everyMs = everyMsOf(watch);

      const nextRunAtMs = watchState.nextRunAtMs;
      if (nextRunAtMs === undefined || nextRunAtMs > nowMs) continue;

      dueRuns.push(toRunDue(watch, nextRunAtMs));
      watchState.nextRunAtMs = everyMs !== undefined
        ? nowMs + everyMs
        : nextCronRunAtMs(watch, nowMs);
      changed = true;
    }

    for (const run of dueRuns) {
      try {
        await onRunDue(run);
      } catch (err) {
        logger.error(`[watch-clock] onRunDue failed for ${run.watchId}:`, err);
      }
    }

    if (changed) {
      notifyStateChanged();
    }

    return dueRuns;
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void tick();
      }, tickIntervalMs);
      timer.unref();
      logger.log(
        `[watch-clock] started (${watches.length} watch(es), tick ${Math.round(
          tickIntervalMs,
        )}ms)`,
      );
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      logger.log("[watch-clock] stopped");
    },

    tick,
    getState,
  };

  function nextCronRunAtMs(
    watch: ResolvedAgentWatchDefinition,
    currentNowMs: number,
  ): number {
    const expression = cronOf(watch);
    if (!expression) {
      throw new Error(`watch ${watch.id} does not have a cron trigger`);
    }
    const interval = CronExpressionParser.parse(expression, {
      currentDate: new Date(currentNowMs),
      tz: watch.trigger.timezone ?? watch.timezone ?? defaultTimezone,
    });
    return interval.next().getTime();
  }
}
