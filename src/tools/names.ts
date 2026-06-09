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

export const ACTIVE_PUBLICATION_TOOL_NAMES = [
  "reply",
  "ask",
  "notify",
  "report",
] as const;

type ActivePublicationToolName =
  (typeof ACTIVE_PUBLICATION_TOOL_NAMES)[number];

export function isActivePublicationToolName(
  value: string,
): value is ActivePublicationToolName {
  return (ACTIVE_PUBLICATION_TOOL_NAMES as readonly string[]).includes(value);
}
