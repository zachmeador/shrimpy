import { formatAgentCurrentTime } from "../../util/time-format.js";

export function formatAgentDateTime(ms: number | Date = new Date()): string {
  return formatAgentCurrentTime(ms);
}
