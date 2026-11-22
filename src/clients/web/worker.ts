/*
 * The page's service worker. It shows a notification for each push the
 * gateway sends, sets the count on the app's icon, opens a notification's
 * thread when it is tapped, in the page if it is open, and tells the gateway
 * when the browser changes where it is told things. It keeps no copy of
 * anything, so the page needs the gateway to show anything at all.
 */
import { readNotification } from "../../contracts/gateway/index.ts";
import { notificationTitle, SOMETHING_NEW } from "../view/index.ts";
import { setCount } from "./badge.ts";
import { ICONS } from "./files.ts";
import { subscribe } from "./subscribe.ts";

/** What a service worker's own events carry, as far as this one uses them. */
interface Waiting extends Event {
  waitUntil(promise: Promise<unknown>): void;
}
interface Pushed extends Waiting {
  readonly data: { json(): unknown } | null;
}
interface Tapped extends Waiting {
  readonly notification: { readonly data: unknown; close(): void };
}
interface Window {
  readonly url: string;
  focus(): Promise<unknown>;
  postMessage(message: unknown): void;
}

/** The worker's own scope, as far as this one uses it. */
const worker = self as unknown as {
  readonly registration: ServiceWorkerRegistration;
  readonly navigator: Navigator;
  readonly clients: {
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly Window[]>;
    openWindow(url: string): Promise<unknown>;
    claim(): Promise<void>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: "install" | "activate" | "pushsubscriptionchange", listener: (event: Waiting) => void): void;
  addEventListener(type: "push", listener: (event: Pushed) => void): void;
  addEventListener(type: "notificationclick", listener: (event: Tapped) => void): void;
};

worker.addEventListener("install", (event) => event.waitUntil(worker.skipWaiting()));
worker.addEventListener("activate", (event) => event.waitUntil(worker.clients.claim()));

worker.addEventListener("push", (event) => {
  let told;
  try {
    told = readNotification(event.data?.json());
  } catch {
    told = undefined;
  }
  // Every push shows a notification, since a browser may stop a page's pushes when one shows nothing.
  if (told === undefined) return event.waitUntil(worker.registration.showNotification(SOMETHING_NEW, { icon: ICONS.small.path }));
  event.waitUntil(
    Promise.all([
      // One notification for each thread: a newer message takes the place of the one before.
      worker.registration.showNotification(notificationTitle(told.from, told.room), {
        body: told.line,
        tag: told.thread,
        data: { thread: told.thread },
        icon: ICONS.small.path,
      }),
      setCount(worker.navigator, told.unread).catch(() => undefined),
    ]),
  );
});

worker.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { thread } = (event.notification.data ?? {}) as { thread?: unknown };
  if (typeof thread !== "string") return;
  event.waitUntil(
    (async () => {
      const [open] = await worker.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (open === undefined) return worker.clients.openWindow(`/threads/${encodeURIComponent(thread)}`);
      await open.focus();
      open.postMessage({ thread });
    })(),
  );
});

// A browser that changes where it is told things is subscribed again, and the gateway told the new place.
worker.addEventListener("pushsubscriptionchange", (event) => event.waitUntil(subscribe(worker.registration)));
