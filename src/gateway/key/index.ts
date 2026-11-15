/**
 * The gateway's key, which proves the gateway to whoever comes in over its
 * entry: made whenever its data directory has none, as at its first start, and
 * kept there readable only by the gateway's account, with the fingerprint an
 * invitation's link carries. It must not know how the entry listens or who is
 * on the roster.
 */
export { type GatewayKey, openKey } from "./key.ts";
