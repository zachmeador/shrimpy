import { Type, type Static } from "@sinclair/typebox";

export const modelSelectionSchema = Type.Object(
  {
    provider: Type.Optional(Type.String({ minLength: 1 })),
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type ModelSelectionConfig = Static<typeof modelSelectionSchema>;

export function mergeModelSelection(
  base?: ModelSelectionConfig,
  override?: ModelSelectionConfig,
): ModelSelectionConfig | undefined {
  if (!base) return override;
  if (!override) return base;
  return {
    provider: override.provider ?? base.provider,
    id: override.id,
  };
}

export function formatModelSelection(model: ModelSelectionConfig): string {
  return model.provider ? `${model.provider}/${model.id}` : model.id;
}
