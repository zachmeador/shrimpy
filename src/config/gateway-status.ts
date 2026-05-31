import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const watchedScheduleSchema = Type.Object(
  {
    label: Type.Optional(Type.String({ minLength: 1 })),
    channel: Type.String({ minLength: 1 }),
    scheduleId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const schema = Type.Object(
  {
    watchedSchedules: Type.Optional(
      Type.Array(watchedScheduleSchema),
    ),
  },
  { additionalProperties: false },
);

export type GatewayStatusConfig = Static<typeof schema>;

export interface ResolvedWatchedScheduleStatusConfig {
  label: string;
  channel: string;
  scheduleId: string;
}

export interface ResolvedGatewayStatusConfig {
  watchedSchedules: ResolvedWatchedScheduleStatusConfig[];
}

export function resolveGatewayStatusConfig(raw?: unknown): ResolvedGatewayStatusConfig {
  const parsed = parseConfig(schema, raw, "status") as GatewayStatusConfig;
  const watchedSchedules = (parsed.watchedSchedules ?? [])
    .map((schedule) => ({
      label: schedule.label ?? schedule.scheduleId,
      channel: schedule.channel,
      scheduleId: schedule.scheduleId,
    }));
  const labels = new Set<string>();
  for (const schedule of watchedSchedules) {
    if (labels.has(schedule.label)) {
      throw new Error(
        `status.watchedSchedules contains duplicate label "${schedule.label}"`,
      );
    }
    labels.add(schedule.label);
  }

  return { watchedSchedules };
}
