import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const watchedWatchSchema = Type.Object(
  {
    label: Type.Optional(Type.String({ minLength: 1 })),
    channel: Type.String({ minLength: 1 }),
    watchId: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const schema = Type.Object(
  {
    watchedWatches: Type.Optional(
      Type.Array(watchedWatchSchema),
    ),
  },
  { additionalProperties: false },
);

export type GatewayStatusConfig = Static<typeof schema>;

export interface ResolvedWatchedWatchStatusConfig {
  label: string;
  channel: string;
  watchId: string;
}

export interface ResolvedGatewayStatusConfig {
  watchedWatches: ResolvedWatchedWatchStatusConfig[];
}

export function resolveGatewayStatusConfig(raw?: unknown): ResolvedGatewayStatusConfig {
  const parsed = parseConfig(schema, raw, "status") as GatewayStatusConfig;
  const watchedWatches = (parsed.watchedWatches ?? [])
    .map((watch) => ({
      label: watch.label ?? watch.watchId,
      channel: watch.channel,
      watchId: watch.watchId,
    }));
  const labels = new Set<string>();
  for (const watch of watchedWatches) {
    if (labels.has(watch.label)) {
      throw new Error(
        `status.watchedWatches contains duplicate label "${watch.label}"`,
      );
    }
    labels.add(watch.label);
  }

  return { watchedWatches };
}
