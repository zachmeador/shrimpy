const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const two = (value: number): string => String(value).padStart(2, "0");

/**
 * A moment as a person at a terminal reads it, in their own time: the time of
 * day for today, the month and day for this year, and the whole date for
 * anything older.
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
