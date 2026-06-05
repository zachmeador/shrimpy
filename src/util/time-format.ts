export function formatFutureOrPast(targetMs: number, nowMs = Date.now()): string {
  const diffSeconds = Math.floor((targetMs - nowMs) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const amount = absSeconds < 60
    ? `${absSeconds}s`
    : absSeconds < 3_600
      ? `${Math.floor(absSeconds / 60)}m`
      : absSeconds < 86_400
        ? `${Math.floor(absSeconds / 3_600)}h`
        : `${Math.floor(absSeconds / 86_400)}d`;

  return diffSeconds >= 0 ? `in ${amount}` : `${amount} ago`;
}

export function resolveLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

export function formatAgentCurrentTime(
  value: number | Date = new Date(),
  opts: {
    timeZone?: string;
  } = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  const timeZone = opts.timeZone ?? resolveLocalTimezone();
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
  return `${local} (${timeZone}, ${formatUtcOffset(date, timeZone)}); UTC: ${date.toISOString()}`;
}

function formatUtcOffset(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
  }).formatToParts(date);
  const raw = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = raw.match(/^GMT(?:(?<sign>[+-])(?<hours>\d{1,2})(?::(?<minutes>\d{2}))?)?$/);
  if (!match?.groups) return raw.replace(/^GMT/, "UTC");

  const sign = match.groups.sign ?? "+";
  const hours = String(Number(match.groups.hours ?? "0")).padStart(2, "0");
  const minutes = match.groups.minutes ?? "00";
  return `UTC${sign}${hours}:${minutes}`;
}

export function parseDurationMs(input: string): number {
  const source = input.trim();
  if (!source) throw new Error("duration must not be empty");

  const pattern = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/g;
  let total = 0;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index !== cursor) {
      throw new Error(`invalid duration: ${input}`);
    }
    cursor += match[0].length;
    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier = unit === "ms"
      ? 1
      : unit === "s"
        ? 1_000
        : unit === "m"
          ? 60_000
          : unit === "h"
            ? 3_600_000
            : 86_400_000;
    total += amount * multiplier;
  }

  if (cursor !== source.length || !(total > 0)) {
    throw new Error(`invalid duration: ${input}`);
  }
  return Math.round(total);
}
