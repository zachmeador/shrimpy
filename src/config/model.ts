import { Type, type Static } from "@sinclair/typebox";

export const modelSelectionSchema = Type.Object(
  {
    provider: Type.String({ minLength: 1 }),
    id: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type ModelSelectionConfig = Static<typeof modelSelectionSchema>;

export function formatModelSelection(model: ModelSelectionConfig): string {
  return `${model.provider}/${model.id}`;
}
