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

interface WatchClockStateEntry {
  nextRunAtMs?: number;
}

export type WatchClockStateSnapshot = Record<string, WatchClockStateEntry>;

export interface WatchClock {
  start(): void;
  stop(): void;
  setWatches(watches: ResolvedAgentWatchDefinition[], nowMs?: number): void;
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

export function computeNextWatchRunAtMs(
  watch: ResolvedAgentWatchDefinition,
  currentNowMs: number,
  defaultTimezone?: string,
): number | undefined {
  const everyMs = everyMsOf(watch);
  if (everyMs !== undefined) {
    return everyMs > 0 ? currentNowMs + everyMs : undefined;
  }

  const expression = cronOf(watch);
  if (!expression) return undefined;
  const interval = CronExpressionParser.parse(expression, {
    currentDate: new Date(currentNowMs),
    tz: watch.trigger.timezone ?? watch.timezone ?? defaultTimezone,
  });
  return interval.next().getTime();
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
    onRunDue,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    defaultTimezone,
    initialState,
    onStateChange,
    now = () => Date.now(),
    logger = console,
  } = config;

  let watches = [...config.watches];
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
      current.nextRunAtMs = computeNextWatchRunAtMs(
        watch,
        currentNowMs,
        defaultTimezone,
      );
      initialized = true;
    }
    if (cronOf(watch) && !current.nextRunAtMs) {
      current.nextRunAtMs = computeNextWatchRunAtMs(
        watch,
        currentNowMs,
        defaultTimezone,
      );
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

      const nextRunAtMs = watchState.nextRunAtMs;
      if (nextRunAtMs === undefined || nextRunAtMs > nowMs) continue;

      dueRuns.push(toRunDue(watch, nextRunAtMs));
      watchState.nextRunAtMs = computeNextWatchRunAtMs(
        watch,
        nowMs,
        defaultTimezone,
      );
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
      void tick();
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

    setWatches(nextWatches, nowMs = now()) {
      const activeWatchIds = new Set(
        nextWatches
          .filter((watch) => watch.enabled !== false)
          .map((watch) => watch.id),
      );
      const nextState = new Map(state);
      let changed = false;
      for (const watchId of [...nextState.keys()]) {
        if (activeWatchIds.has(watchId)) continue;
        nextState.delete(watchId);
        changed = true;
      }
      for (const watch of nextWatches) {
        if (watch.enabled === false) continue;
        const current = nextState.get(watch.id) ?? {};
        if (current.nextRunAtMs === undefined) {
          current.nextRunAtMs = computeNextWatchRunAtMs(
            watch,
            nowMs,
            defaultTimezone,
          );
          nextState.set(watch.id, current);
          changed = true;
        }
      }
      watches = [...nextWatches];
      state.clear();
      for (const [watchId, runtime] of nextState) state.set(watchId, runtime);
      if (changed) notifyStateChanged();
    },

    tick,
    getState,
  };
}
