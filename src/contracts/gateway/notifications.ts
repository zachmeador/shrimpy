import { int, method, nul, obj, remote, type Static, str, union } from "@earendil-works/chord";
import { compile } from "@earendil-works/pi-schema";
import { answerOf } from "./answers.ts";
import { gateway } from "./hosts.ts";
import { openObject } from "./open.ts";

const NOTIFICATION = {
  /** Who wrote, by name: the author of a message, or the agent whose receipt says a message of yours failed. */
  from: str(),
  /** The room it was in, by name, or null for a DM. */
  room: union([str(), nul()]),
  /** The first line of the message, cut short, or what the failed receipt says. */
  line: str(),
  /** The ID of the thread to open. */
  thread: str(),
  /** How many messages are new to you in all, across the threads of your DMs and rooms, for the count on an app's icon. */
  unread: int(),
};

/**
 * Something to tell you on your devices, finished by the chat server: who
 * wrote, the room when it was in one, the line to show, the thread to open and
 * how much is new to you in all. The gateway sends it as it is, as JSON,
 * encrypted for each device.
 */
export const NotificationSchema = obj(NOTIFICATION);
export type Notification = Static<typeof NotificationSchema>;

const checkNotification = compile(openObject(NOTIFICATION)).check;

/** A `Notification` from `value`, which a push carried as JSON, or undefined when it isn't one. */
export function readNotification(value: unknown): Notification | undefined {
  return checkNotification(value) ? (value as Notification) : undefined;
}

/**
 * Where the chat server hands the gateway something to tell you, at
 * `gateway()`. The gateway sends it to each device of yours that has a place
 * to be told things, and reads nothing else of chat. Only the chat server may
 * hand it anything.
 */
export const Notifications = remote("shrimpy.gateway.notifications", {
  version: 2,
  params: {},
  hostAddress: () => gateway(),
  variants: {
    all: {
      methods: {
        /** Sends `notification` to your devices, answering once each push service has answered or given up. */
        notify: method(NotificationSchema, answerOf(nul())),
      },
    },
  },
});
