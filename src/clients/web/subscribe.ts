/*
 * Where this browser is told things: subscribed with the key the gateway's
 * page door gives, and handed to the door. The page does it when the person
 * says yes and at every start, and the service worker when the browser
 * changes the place. It uses nothing a service worker lacks.
 */
import { PAGE_PUSH, type PagePushKey } from "../../contracts/gateway/index.ts";

/** A key in base64url, as the page's door gives it, as the bytes a push subscription takes. */
function keyBytes(key: string): Uint8Array<ArrayBuffer> {
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(key.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

/** Whether a subscription was made with `key`. */
function madeWith(subscription: PushSubscription, key: Uint8Array): boolean {
  const held = subscription.options.applicationServerKey;
  if (held === null || held.byteLength !== key.byteLength) return false;
  return new Uint8Array(held).every((byte, at) => byte === key[at]);
}

/**
 * Subscribe the browser with the gateway's key, or take the place it has, and
 * hand it to the gateway, which keeps one place for each browser: true once
 * the gateway has kept it. A place made with another key, as a gateway made
 * afresh at the same address leaves behind, is no use to this gateway and
 * stands in the way of a new one, so it goes first.
 */
export async function subscribe(registration: ServiceWorkerRegistration): Promise<boolean> {
  const { key } = (await (await fetch(PAGE_PUSH)).json()) as PagePushKey;
  const bytes = keyBytes(key);
  let subscription = await registration.pushManager.getSubscription();
  if (subscription !== null && !madeWith(subscription, bytes)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
  // Keeping the same place again changes nothing, so it is handed over at every start. The door answers 204 when it kept it.
  const kept = await fetch(PAGE_PUSH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
  return kept.status === 204;
}
