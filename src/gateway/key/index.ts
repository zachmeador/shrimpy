/**
 * The gateway's keys, each made whenever its data directory has none, as at
 * its first start, and kept there readable only by the gateway's account: the
 * one that proves the gateway to whoever comes in over its entry, with the
 * fingerprint an invitation's link carries, and the one it signs notifications
 * with for your devices' push services. It must not know how the entry
 * listens, who is on the roster or how a notification is sent.
 */
export { openKey, openPushKey } from "./key.ts";
