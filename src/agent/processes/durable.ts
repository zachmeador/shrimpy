/**
 * Shrimpy's shell and background command subsystem: the `bash` and `process`
 * tools, `ProcessesDoc` persistence, output log spilling, built-in 60s sync
 * wait -> auto-backgrounding, 15m hang check-in, and restart recovery.
 */
export {
  createProcesses,
  DEFAULT_CHECKIN_MS,
  DEFAULT_SYNC_WAIT_MS,
  type Processes,
  type ProcessesOptions,
} from "./manager.durable.ts";
export { processTools } from "./tools.durable.ts";
