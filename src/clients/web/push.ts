/*
 * Push on this device: the service worker, the person's leave, asked from a
 * button, where the browser is told things, handed to the page's door at
 * every start, and the thread of a notification tapped while the page is
 * open. On an iPhone a page has push only once it is installed to the home
 * screen.
 */
import { WORKER } from "./files.ts";
import { subscribe } from "./subscribe.ts";

/** Where push stands on this device: it has none, the person has not said, it is on, or they said no. */
export type Push = "none" | "ask" | "on" | "blocked";

/**
 * Look after the page with the service worker, and, where the person has said
 * yes, keep the gateway told where this browser is. A browser that won't take
 * the worker has no push here, and one that can't be subscribed now can be
 * asked again.
 */
export async function startPush(): Promise<Push> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "none";
  let registration: ServiceWorkerRegistration;
  try {
    registration = await navigator.serviceWorker.register(WORKER);
  } catch {
    return "none";
  }
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "ask";
  return subscribe(registration).then(
    (kept) => (kept ? "on" : "ask"),
    () => "ask",
  );
}

/** Ask the person's leave, which a browser takes only from a tap or a click, and subscribe once they give it. */
export async function askPush(): Promise<Push> {
  const answer = await Notification.requestPermission();
  if (answer === "denied") return "blocked";
  if (answer !== "granted") return "ask";
  return (await subscribe(await navigator.serviceWorker.ready)) ? "on" : "ask";
}

/** Tell `open` the thread of each notification tapped while the page is open. Returns what stops that. */
export function onTapped(open: (thread: string) => void): () => void {
  if (!("serviceWorker" in navigator)) return () => undefined;
  const heard = (event: MessageEvent): void => {
    const { thread } = (event.data ?? {}) as { thread?: unknown };
    if (typeof thread === "string") open(thread);
  };
  navigator.serviceWorker.addEventListener("message", heard);
  return () => navigator.serviceWorker.removeEventListener("message", heard);
}
