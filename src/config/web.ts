import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const schema = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean({ default: true })),
    port: Type.Optional(Type.Integer({
      minimum: 1,
      maximum: 65_535,
      default: 5174,
    })),
  },
  { additionalProperties: false },
);

export type WebConfig = Static<typeof schema>;

export interface ResolvedWebConfig {
  enabled: boolean;
  port: number;
}

export function resolveWebConfig(raw?: unknown): ResolvedWebConfig {
  const parsed = parseConfig(schema, raw, "web") as WebConfig;
  return {
    enabled: parsed.enabled ?? true,
    port: parsed.port ?? 5174,
  };
}
