import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const routeSchema = Type.Object(
  {
    adapter: Type.String({ minLength: 1 }),
    channelPrefix: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const schema = Type.Object(
  {
    routes: Type.Optional(Type.Array(routeSchema)),
  },
  { additionalProperties: false },
);

export type AdapterRouteConfigEntry = Static<typeof routeSchema>;
export type AdapterRoutingConfig = Static<typeof schema>;
export type ResolvedAdapterRoutingConfig = { routes: AdapterRouteConfigEntry[] };

export function resolveAdapterRoutingConfig(
  raw?: unknown,
  defaults: AdapterRouteConfigEntry[] = [],
): ResolvedAdapterRoutingConfig {
  const parsed = parseConfig(schema, raw, "adapters");
  const routes = [...defaults, ...(parsed.routes ?? [])];
  const unique = new Map<string, AdapterRouteConfigEntry>();

  for (const route of routes) {
    unique.set(`${route.adapter}:${route.channelPrefix}`, { ...route });
  }

  return { routes: [...unique.values()] };
}
