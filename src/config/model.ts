import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const DEFAULT_MODEL_POLICY = "coding";

export const modelSelectionSchema = Type.Object(
  {
    provider: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type ModelSelectionConfig = Static<typeof modelSelectionSchema>;

export const modelPolicySchema = Type.Object(
  {
    candidates: Type.Array(modelSelectionSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);

export const modelPoliciesSchema = Type.Record(
  Type.String({ minLength: 1 }),
  modelPolicySchema,
);

export type ModelPolicyConfig = Static<typeof modelPolicySchema>;
export type ModelPoliciesConfig = Record<string, ModelPolicyConfig>;

export function formatModelSelection(model: ModelSelectionConfig): string {
  return `${model.provider}/${model.id}`;
}

export function validateModelPoliciesConfig(raw: unknown): ModelPoliciesConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("modelPolicies must be an object");
  }
  if (!Value.Check(modelPoliciesSchema, raw)) {
    const [err] = Value.Errors(modelPoliciesSchema, raw);
    throw new Error(`modelPolicies: ${err?.message ?? "invalid"}`);
  }
  const policies = raw as ModelPoliciesConfig;
  if (!policies[DEFAULT_MODEL_POLICY]) {
    throw new Error(`modelPolicies must include "${DEFAULT_MODEL_POLICY}"`);
  }
  return policies;
}
