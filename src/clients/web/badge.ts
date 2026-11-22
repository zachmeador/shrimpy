/** Set the count on the app's icon to `unread`, where the device shows one, as the page or its service worker can. */
export async function setCount(on: Navigator, unread: number): Promise<void> {
  if (!("setAppBadge" in on)) return;
  await (unread > 0 ? on.setAppBadge(unread) : on.clearAppBadge());
}
