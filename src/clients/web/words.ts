/*
 * Every sentence the placeholder page shows, and how it labels the browser
 * among your devices.
 */

export const LINKING = "Linking to the gateway…";

export const READING = "Reading the roster…";

export const ON_THE_ROSTER = "On the roster:";

export const LOST = "The link to the gateway was lost. Reload the page to link again.";

/** That the door's answer to the code couldn't be read, with the status it came with. */
export const unreadableJoin = (status: number): string =>
  `The gateway answered the invitation's code with something this page can't read (HTTP ${String(status)}). Reload the page, or ask for a new invitation.`;

/** The platforms a browser's user agent names, the more particular first, since an iPhone's names a Mac and Android's names Linux. */
const PLATFORMS = ["iPhone", "iPad", "Android", "Mac", "Windows", "Linux"];

/** How a browser is labelled among your devices, from its user agent. */
export function browserLabel(userAgent: string): string {
  const platform = PLATFORMS.find((name) => userAgent.includes(name));
  return platform === undefined ? "a browser" : `a browser on ${platform}`;
}
