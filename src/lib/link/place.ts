/** Where a link is made: a Unix socket's path, or a host and a port. */
export type Place = { readonly path: string } | { readonly host: string; readonly port: number };

/**
 * An address as it is written in a link or a URL, and as a person reads it:
 * `100.101.102.103:7447`, and `[fd7a:115c:a1e0::1]:7447` for an IPv6 address,
 * which has colons of its own.
 */
export function formatAddress(address: { readonly host: string; readonly port: number }): string {
  const host = address.host.includes(":") ? `[${address.host}]` : address.host;
  return `${host}:${String(address.port)}`;
}

/** The WebSocket URL of `place`: `ws+unix:` for a socket's path, and `wss:` for an address, where every link is TLS. */
export function placeUrl(place: Place): string {
  return "path" in place ? `ws+unix:${place.path}:/` : `wss://${formatAddress(place)}/`;
}

/** `place` as a person reads it: the socket's path, or the address. */
export function describePlace(place: Place): string {
  return "path" in place ? place.path : formatAddress(place);
}
