import { remote } from "@earendil-works/chord";
import { chat } from "../gateway/index.ts";

/**
 * The chat server being there, at `chat()`. The gateway holds it from when it
 * starts, which keeps the route to the chat server resolved while it is linked.
 * It has no members, so it never needs a new version.
 */
export const ChatPresence = remote("shrimpy.chat.presence", {
  version: 1,
  params: {},
  hostAddress: () => chat(),
  variants: { present: {} },
});
