const CHANNEL_NAME_PATTERN = /^[a-z0-9._~-]+$/;
const MAX_CHANNEL_NAME_LENGTH = 200;

export type ChannelName = string & { readonly __channelName: unique symbol };

export function parseChannelName(value: string): ChannelName {
  const name = value.trim();
  if (name.length === 0) {
    throw new Error(channelNameError(value, "must not be empty"));
  }
  if (name.length > MAX_CHANNEL_NAME_LENGTH) {
    throw new Error(channelNameError(value, `must be at most ${MAX_CHANNEL_NAME_LENGTH} characters`));
  }
  if (name !== value) {
    throw new Error(channelNameError(value, "must not include leading or trailing whitespace"));
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error(channelNameError(value, "must not include path separators"));
  }
  if (name === "." || name === ".." || name.includes("..")) {
    throw new Error(channelNameError(value, "must not include traversal segments"));
  }
  if (!CHANNEL_NAME_PATTERN.test(name)) {
    throw new Error(channelNameError(
      value,
      "must use only lowercase letters, numbers, dot, underscore, hyphen, and tilde",
    ));
  }
  return name as ChannelName;
}

export function assertChannelName(value: string): void {
  parseChannelName(value);
}

function channelNameError(value: string, reason: string): string {
  return `invalid channel name "${value}": ${reason}; use lowercase a-z, 0-9, ".", "_", "-", or "~", with no path separators or traversal`;
}
