import { CronExpressionParser } from "cron-parser";
import type {
  ScheduleDefinition,
  ScheduleRunDue,
} from "./schema.js";

export interface SchedulerConfig {
  schedules: ScheduleDefinition[];
  onRunDue: (run: ScheduleRunDue) => Promise<void> | void;
  onTick?: (nowMs: number) => Promise<void> | void;
  tickIntervalMs?: number;
  defaultTimezone?: string;
  initialState?: SchedulerStateSnapshot;
  onStateChange?: (state: SchedulerStateSnapshot) => void;
  now?: () => number;
  logger?: Pick<Console, "log" | "warn" | "error">;
}

interface ScheduleRuntimeState {
  nextRunAtMs?: number;
}

export interface SchedulerStateEntry {
  nextRunAtMs?: number;
}

export type SchedulerStateSnapshot = Record<string, SchedulerStateEntry>;

export interface Scheduler {
  start(): void;
  stop(): void;
  tick(nowMs?: number): Promise<ScheduleRunDue[]>;
  getState(): SchedulerStateSnapshot;
}

const DEFAULT_TICK_INTERVAL_MS = 1_000;

function everyMsOf(schedule: ScheduleDefinition): number | undefined {
  return schedule.trigger.type === "every_ms"
    ? schedule.trigger.everyMs
    : undefined;
}

function toRunDue(
  schedule: ScheduleDefinition,
  fireTimeMs: number,
): ScheduleRunDue {
  const fireTimeIso = new Date(fireTimeMs).toISOString();
  return {
    schedule,
    scheduleId: schedule.id,
    runId: crypto.randomUUID(),
    fireTimeMs,
    fireTimeIso,
    dedupeKey: `${schedule.id}:${fireTimeIso}`,
  };
}

export function createScheduler(config: SchedulerConfig): Scheduler {
  const {
    schedules,
    onRunDue,
    onTick,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    defaultTimezone,
    initialState,
    onStateChange,
    now = () => Date.now(),
    logger = console,
  } = config;

  const state = new Map<string, ScheduleRuntimeState>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastSnapshotKey = "";

  function getState(): SchedulerStateSnapshot {
    const snapshot: SchedulerStateSnapshot = {};
    for (const [scheduleId, runtime] of state) {
      if (runtime.nextRunAtMs === undefined) continue;
      snapshot[scheduleId] = { nextRunAtMs: runtime.nextRunAtMs };
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
    for (const [scheduleId, persisted] of Object.entries(initialState)) {
      if (!persisted) continue;
      state.set(scheduleId, {
        nextRunAtMs: persisted.nextRunAtMs,
      });
    }
    lastSnapshotKey = JSON.stringify(getState());
  }

  function ensureState(
    schedule: ScheduleDefinition,
    currentNowMs: number,
  ): { runtime: ScheduleRuntimeState; initialized: boolean } {
    let current = state.get(schedule.id);
    let initialized = false;
    if (!current) {
      current = {};
      state.set(schedule.id, current);
    }

    const everyMs = everyMsOf(schedule);
    if (everyMs && !current.nextRunAtMs) {
      current.nextRunAtMs = currentNowMs + everyMs;
      initialized = true;
    }
    if (schedule.trigger.type === "cron" && !current.nextRunAtMs) {
      current.nextRunAtMs = nextCronRunAtMs(schedule, currentNowMs);
      initialized = true;
    }
    return { runtime: current, initialized };
  }

  async function tick(nowMs = now()): Promise<ScheduleRunDue[]> {
    const dueRuns: ScheduleRunDue[] = [];
    let changed = false;

    for (const schedule of schedules) {
      if (schedule.enabled === false) continue;

      const { runtime: scheduleState, initialized } = ensureState(schedule, nowMs);
      if (initialized) changed = true;

      const everyMs = schedule.trigger.type === "every_ms"
        ? schedule.trigger.everyMs
        : undefined;
      if (schedule.trigger.type === "every_ms" && !(everyMs! > 0)) {
        logger.warn(
          `[scheduler] invalid every_ms interval for schedule ${schedule.id}: ${everyMs}`,
        );
        continue;
      }

      const nextRunAtMs = scheduleState.nextRunAtMs;
      if (nextRunAtMs === undefined || nextRunAtMs > nowMs) continue;

      dueRuns.push(toRunDue(schedule, nextRunAtMs));
      scheduleState.nextRunAtMs = schedule.trigger.type === "every_ms"
        ? nowMs + everyMs!
        : nextCronRunAtMs(schedule, nowMs);
      changed = true;
    }

    for (const run of dueRuns) {
      try {
        await onRunDue(run);
      } catch (err) {
        logger.error(`[scheduler] onRunDue failed for ${run.scheduleId}:`, err);
      }
    }

    if (onTick) {
      try {
        await onTick(nowMs);
      } catch (err) {
        logger.error("[scheduler] onTick failed:", err);
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
        `[scheduler] started (${schedules.length} schedule(s), tick ${Math.round(
          tickIntervalMs,
        )}ms)`,
      );
    },

    stop() {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
      logger.log("[scheduler] stopped");
    },

    tick,
    getState,
  };

  function nextCronRunAtMs(
    schedule: ScheduleDefinition,
    currentNowMs: number,
  ): number {
    const expression = schedule.trigger.type === "cron"
      ? schedule.trigger.expression
      : "* * * * *";
    const interval = CronExpressionParser.parse(expression, {
      currentDate: new Date(currentNowMs),
      tz: schedule.trigger.type === "cron"
        ? (schedule.trigger.timezone ?? schedule.timezone ?? defaultTimezone)
        : defaultTimezone,
    });
    return interval.next().getTime();
  }
}
