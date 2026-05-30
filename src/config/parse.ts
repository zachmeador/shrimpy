import { type TSchema, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export function parseConfig<T extends TSchema>(
  schema: T,
  raw: unknown,
  label: string,
): Static<T> {
  if (
    raw !== undefined &&
    (typeof raw !== "object" || raw === null || Array.isArray(raw))
  ) {
    throw new Error(`${label} must be an object`);
  }
  const value = Value.Default(schema, raw ?? {});
  if (!Value.Check(schema, value)) {
    const [first] = Value.Errors(schema, value);
    throw new Error(first?.message ?? `invalid ${label} config`);
  }
  return value as Static<T>;
}
