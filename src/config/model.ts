import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Api, Model } from "@earendil-works/pi-ai";

export const DEFAULT_MODEL_POLICY = "coding";

export const modelSelectionSchema = Type.Object(
  {
    provider: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type ModelSelectionConfig = Static<typeof modelSelectionSchema>;

export interface ModelRef {
  provider: string;
  id: string;
}

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
  return formatModelRef(model);
}

export function formatModelRef(model: ModelRef | undefined, fallback = "unset"): string {
  if (!model) return fallback;
  return `${model.provider}/${model.id}`;
}

export function parseModelRef(raw: string, label = "model candidate"): ModelRef {
  const slash = raw.indexOf("/");
  if (slash <= 0 || slash === raw.length - 1) {
    throw new Error(`${label} must be <provider>/<model>: ${raw}`);
  }
  return {
    provider: raw.slice(0, slash),
    id: raw.slice(slash + 1),
  };
}

export function sameModelRef(
  left: ModelRef | undefined,
  right: ModelRef | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.provider === right.provider && left.id === right.id;
}

export function toModelRef(model: ModelSelectionConfig | Model<Api>): ModelRef;
export function toModelRef(model: ModelSelectionConfig | Model<Api> | undefined): ModelRef | undefined;
export function toModelRef(
  model: ModelSelectionConfig | Model<Api> | undefined,
): ModelRef | undefined {
  if (!model) return undefined;
  return {
    provider: model.provider,
    id: model.id,
  };
}

export function hasConfiguredAuth(
  modelRegistry: {
    hasConfiguredAuth?: (candidate: Model<Api>) => boolean;
  },
  model: Model<Api>,
): boolean {
  return modelRegistry.hasConfiguredAuth ? modelRegistry.hasConfiguredAuth(model) : true;
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
