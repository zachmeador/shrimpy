import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const schema = Type.Object(
  {
    heartbeatChannel: Type.Optional(
      Type.String({ minLength: 1, default: "heartbeat" }),
    ),
    heartbeatScheduleId: Type.Optional(
      Type.String({ minLength: 1, default: "shrimpy/heartbeat" }),
    ),
  },
  { additionalProperties: false },
);

export type GatewayStatusConfig = Static<typeof schema>;
export type ResolvedGatewayStatusConfig = Required<GatewayStatusConfig>;

export function resolveGatewayStatusConfig(raw?: unknown): ResolvedGatewayStatusConfig {
  return parseConfig(schema, raw, "status") as ResolvedGatewayStatusConfig;
}
