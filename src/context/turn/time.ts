const agentDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});

export function formatAgentDateTime(ms: number | Date = new Date()): string {
  return agentDateTimeFormatter.format(ms);
}
