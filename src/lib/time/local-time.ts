/**
 * A moment, in milliseconds since the epoch, in the machine's local time to the
 * second, with the offset from UTC in force at that moment: for example
 * `2026-10-05T09:00:29-04:00`. The zone is the one the process runs in, read each
 * time this is called, so a time reads the same as `date` shows it in a shell on
 * the machine. A machine on UTC writes `+00:00`. Throws for a number that is not
 * a moment.
 */
export function localTime(milliseconds: number): string {
  const moment = new Date(milliseconds);
  if (Number.isNaN(moment.getTime())) throw new RangeError(`${String(milliseconds)} is not a time.`);
  const two = (value: number): string => String(Math.trunc(value)).padStart(2, "0");
  const minutesEast = Math.round(-moment.getTimezoneOffset());
  const away = Math.abs(minutesEast);
  return (
    `${String(moment.getFullYear()).padStart(4, "0")}-${two(moment.getMonth() + 1)}-${two(moment.getDate())}` +
    `T${two(moment.getHours())}:${two(moment.getMinutes())}:${two(moment.getSeconds())}` +
    `${minutesEast < 0 ? "-" : "+"}${two(away / 60)}:${two(away % 60)}`
  );
}
