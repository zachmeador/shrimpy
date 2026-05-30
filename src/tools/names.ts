export const DAEMON_TOOL_NAMES = [
  "reply",
  "ask",
  "notify",
  "report",
  "send_message",
  "read_channel",
  "run_child",
] as const;

export type DaemonToolName = (typeof DAEMON_TOOL_NAMES)[number];
