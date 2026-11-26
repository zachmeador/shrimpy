const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (value: number): string => String(value).padStart(2, "0");

/**
 * A moment as a person reads it, in their own time: the time of day for today,
 * the month and day for this year, and the whole date for anything older.
 */
export function whenOf(milliseconds: number, now: number): string {
  const time = new Date(milliseconds);
  const today = new Date(now);
  const clock = `${two(time.getHours())}:${two(time.getMinutes())}`;
  if (time.getFullYear() === today.getFullYear() && time.getMonth() === today.getMonth() && time.getDate() === today.getDate()) {
    return clock;
  }
  if (time.getFullYear() === today.getFullYear()) return `${MONTHS[time.getMonth()] ?? ""} ${String(time.getDate())} ${clock}`;
  return `${String(time.getFullYear())}-${two(time.getMonth() + 1)}-${two(time.getDate())} ${clock}`;
}

/** How long something has been running or waiting, compactly: "42s", "12m", "1h 4m", "2d 3h". */
export function elapsedOf(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  if (seconds < 60) return `${String(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return remMin === 0 ? `${String(hours)}h` : `${String(hours)}h ${String(remMin)}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${String(days)}d` : `${String(days)}d ${String(remHours)}h`;
}
