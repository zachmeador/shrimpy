import type { ScheduleRunDue } from "../../scheduler/schema.js";

export function renderHeartbeatScheduleInstructions(): string {
  return "Review recent activity, update memory if needed, and decide whether anything needs attention.";
}

export function renderScheduledTextRun(run: ScheduleRunDue): string {
  const action = run.schedule.action;
  if (action.kind !== "agent") return "";
  const text = action.target.contentData?.text;
  return String(text);
}
