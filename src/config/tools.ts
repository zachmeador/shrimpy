import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const sendMessageSchema = Type.Object(
  { defaultActorId: Type.Optional(Type.String({ minLength: 1 })) },
  { additionalProperties: false },
);

const readChannelSchema = Type.Object(
  { defaultLimit: Type.Optional(Type.Integer({ minimum: 1 })) },
  { additionalProperties: false },
);

const schema = Type.Object(
  {
    sendMessage: Type.Optional(sendMessageSchema),
    readChannel: Type.Optional(readChannelSchema),
  },
  { additionalProperties: false },
);

export type ToolRuntimeConfig = Static<typeof schema>;
export type ResolvedToolRuntimeConfig = {
  sendMessage: { defaultActorId: string };
  readChannel: { defaultLimit: number };
};

export function resolveToolRuntimeConfig(raw?: unknown): ResolvedToolRuntimeConfig {
  const parsed = parseConfig(schema, raw, "tools");
  return {
    sendMessage: {
      defaultActorId: parsed.sendMessage?.defaultActorId ?? "agent:shrimpy",
    },
    readChannel: {
      defaultLimit: parsed.readChannel?.defaultLimit ?? 20,
    },
  };
}
