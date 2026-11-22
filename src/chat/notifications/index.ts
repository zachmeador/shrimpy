/**
 * What is worth telling you on your devices, and when: a message someone else
 * wrote in a DM of yours, a message that names you in a room you are in, and a
 * receipt that says a message of yours failed, each once it has stayed unread
 * for a few seconds by the read marks the store keeps. Each is handed over
 * finished: who wrote, the room, a line, the thread and how much is new to you
 * in all. What waits is held in memory, so a chat server that stops forgets
 * it. It must not know how a notification reaches you: nothing of the gateway,
 * devices or push.
 */
export { createNotifier, NOTIFY_AFTER_MS, type RunningNotifier } from "./notifier.ts";
