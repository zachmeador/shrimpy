import type { Address } from "./services.ts";

/**
 * An address as it is written in a link or a URL: `100.101.102.103:7447`, and
 * `[fd7a:115c:a1e0::1]:7447` for an IPv6 address, which has colons of its own.
 */
export function formatAddress(address: Address): string {
  const host = address.host.includes(":") ? `[${address.host}]` : address.host;
  return `${host}:${String(address.port)}`;
}
