export function parsePositiveInt(value: string, label: string): number;
export function parsePositiveInt(value: string | undefined, label: string): number | undefined;
export function parsePositiveInt(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}
