import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const channelUnreadSchema = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean({ default: true })),
    channels: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
    includeLatest: Type.Optional(Type.Boolean({ default: true })),
  },
  { additionalProperties: false, default: {} },
);

/**
 * Briefing config (the per-turn rendering and channel-unread settings).
 * Command-typed context sources moved to context.sources as part of the
 * source-model unification; this config retains only render-side knobs.
 */
const schema = Type.Object(
  {
    maxChars: Type.Optional(Type.Integer({ minimum: 1, default: 2000 })),
    channelUnread: Type.Optional(channelUnreadSchema),
  },
  { additionalProperties: false },
);

export type BriefingConfig = Static<typeof schema>;

export interface ResolvedBriefingConfig {
  maxChars: number;
  channelUnread: {
    enabled: boolean;
    channels: string[];
    includeLatest: boolean;
  };
}

export function resolveBriefingConfig(raw?: unknown): ResolvedBriefingConfig {
  const parsed = parseConfig(schema, raw, "briefing");
  return {
    maxChars: parsed.maxChars ?? 2000,
    channelUnread: {
      enabled: parsed.channelUnread?.enabled ?? true,
      channels: parsed.channelUnread?.channels ?? ["*"],
      includeLatest: parsed.channelUnread?.includeLatest ?? true,
    },
  };
}
