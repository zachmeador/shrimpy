const LOCAL_DIRECT_CHANNELS = new Set(["tui", "run"]);

export function isLocalDirectChannel(channel: string): boolean {
  return LOCAL_DIRECT_CHANNELS.has(channel);
}
