import type { KeyObject } from "node:crypto";
import type { Notification } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { encrypt, vapid, type WebPushPlace } from "./web-push.ts";

export interface PushOptions {
  /** Where each device of yours that has such a place is told things, by its way in, as it is now. */
  places(): readonly { readonly way: string; readonly place: WebPushPlace }[];
  /** Forget where the device of `way` is told things, if it is still `endpoint`: its push service says it is gone. */
  forget(way: string, endpoint: string): void;
  /** The key the gateway signs with, whose public half every device subscribed with. */
  readonly key: KeyObject;
  /** Who a push service may write to about the gateway, an https: address, or undefined for nobody. */
  contact(): string | undefined;
  /** Told when a push service turns a notification away or can't be reached. That device misses it. */
  onError(error: Error): void;
}

export interface Push {
  /** Send `notification` to each device of yours that has a place, once each, resolving once every push service has answered or given up. */
  notify(notification: Notification): Promise<void>;
}

/** How long a push service keeps a notification for a device that is away: a day. */
const TTL_SECONDS = 24 * 60 * 60;

/** How long the gateway waits for a push service to answer. */
const ANSWER_MS = 30_000;

/**
 * Notifications by Web Push: encrypted for each device's place, signed with
 * the gateway's key, and sent to the push service there. A place its push
 * service says is gone, with 404 or 410, is forgotten. Nothing is sent again.
 */
export function createPush(options: PushOptions): Push {
  const sendTo = async (way: string, place: WebPushPlace, message: Buffer): Promise<void> => {
    const service = new URL(place.endpoint).origin;
    let body: Buffer;
    try {
      body = encrypt(message, place);
    } catch (error) {
      options.onError(new Error(`A notification didn't reach a device: the key its browser gave can't be used. ${asError(error).message}`));
      return;
    }
    let response: Response;
    try {
      response = await fetch(place.endpoint, {
        method: "POST",
        headers: {
          TTL: String(TTL_SECONDS),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          Authorization: vapid(place.endpoint, options.key, options.contact(), Date.now()),
        },
        body,
        signal: AbortSignal.timeout(ANSWER_MS),
      });
      await response.arrayBuffer();
    } catch (error) {
      options.onError(new Error(`A notification didn't reach a device: the push service at ${service} couldn't be reached. ${asError(error).message}`));
      return;
    }
    if (response.status === 404 || response.status === 410) return options.forget(way, place.endpoint);
    if (!response.ok) {
      options.onError(
        new Error(`A notification didn't reach a device: the push service at ${service} turned it away with ${String(response.status)} ${response.statusText}.`),
      );
    }
  };

  return {
    async notify(notification) {
      const message = Buffer.from(JSON.stringify(notification));
      await Promise.all(options.places().map(({ way, place }) => sendTo(way, place, message)));
    },
  };
}
