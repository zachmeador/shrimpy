/** A length of time in its two largest units: "2 hours 30 minutes", "5 minutes", "1 day". */
export function howLong(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  const counts = [
    Math.floor(seconds / 86_400),
    Math.floor((seconds % 86_400) / 3_600),
    Math.floor((seconds % 3_600) / 60),
    seconds % 60,
  ];
  const names = ["day", "hour", "minute", "second"];
  const first = Math.max(
    0,
    counts.findIndex((count) => count > 0),
  );
  return counts
    .slice(first, first + 2)
    .flatMap((count, index) => (count > 0 ? [`${count} ${names[first + index] ?? ""}${count === 1 ? "" : "s"}`] : []))
    .join(" ");
}
