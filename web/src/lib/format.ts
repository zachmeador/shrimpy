export function tsHHMMSS(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  const mi = String(d.getMilliseconds()).padStart(3, "0");
  return `${h}:${m}:${s}.${mi}`;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatEventTime(ms: number, now = new Date()): string {
  if (!ms) return "";
  const d = new Date(ms);
  if (isSameLocalDay(d, now)) return tsHHMMSS(ms);
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${mo}/${da} ${h}:${m}:${s}`;
}

export function tsFromIso(iso: string): number {
  return new Date(iso).getTime();
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function shortName(name: string): string {
  const m = name.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-\d{3}Z_([0-9a-f]{8})/);
  if (m) return `${m[1].replace("T", " ")} ${m[2]}`;
  return name.replace(/\.jsonl$/, "");
}

function stringifyArg(value: unknown): string {
  if (value == null) return String(value);
  if (typeof value === "string") {
    return value.length > 60
      ? JSON.stringify(value.slice(0, 57)) + "…"
      : JSON.stringify(value);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }
  if (typeof value === "symbol") return value.description ?? "";
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  try {
    const serialized: unknown = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : "";
  } catch {
    return "[unserializable]";
  }
}

export function argsOneLine(args: unknown): string {
  if (args == null) return "";
  if (typeof args !== "object") return stringifyArg(args);
  const entries = Object.entries(args as Record<string, unknown>);
  return entries
    .map(([k, v]) => {
      const rendered = stringifyArg(v);
      const s = rendered.length > 60 ? rendered.slice(0, 57) + "…" : rendered;
      return `${k}=${s}`;
    })
    .join(", ");
}

export function firstLines(text: string, n: number): { preview: string; more: boolean } {
  const lines = text.split("\n");
  if (lines.length <= n) return { preview: text, more: false };
  return { preview: lines.slice(0, n).join("\n"), more: true };
}
