import { Type, type Static } from "@sinclair/typebox";
import { parseConfig } from "./parse.js";

const compactionPolicySchema = Type.Object(
  {
    enabled: Type.Optional(Type.Boolean()),
    reserveTokens: Type.Optional(Type.Number({ minimum: 0 })),
    thresholdTokens: Type.Optional(Type.Number({ minimum: 1 })),
    keepRecentTokens: Type.Optional(Type.Number({ minimum: 1 })),
    instructions: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const compactionSchema = Type.Object(
  {
    enabled: Type.Boolean({ default: true }),
    reserveTokens: Type.Number({ minimum: 0, default: 32768 }),
    thresholdTokens: Type.Optional(Type.Number({ minimum: 1 })),
    keepRecentTokens: Type.Number({ minimum: 1, default: 30000 }),
    instructions: Type.Optional(Type.String({ minLength: 1 })),
    agents: Type.Optional(Type.Record(Type.String(), compactionPolicySchema)),
    channels: Type.Optional(Type.Record(Type.String(), compactionPolicySchema)),
    sessions: Type.Optional(Type.Record(Type.String(), compactionPolicySchema)),
  },
  { additionalProperties: false, default: {} },
);

const schema = Type.Object(
  {
    theme: Type.Optional(Type.String({ minLength: 1, default: "shrimpy" })),
    quietStartup: Type.Optional(Type.Boolean({ default: true })),
    noSkills: Type.Optional(Type.Boolean({ default: false })),
    noPromptTemplates: Type.Optional(Type.Boolean({ default: true })),
    compaction: Type.Optional(compactionSchema),
  },
  { additionalProperties: false },
);

export type RuntimeConfig = Static<typeof schema>;
export type CompactionConfig = Static<typeof compactionSchema>;

export function resolveRuntimeConfig(raw?: unknown): Required<RuntimeConfig> {
  return parseConfig(schema, raw, "runtime") as Required<RuntimeConfig>;
}
