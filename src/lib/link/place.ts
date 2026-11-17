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

/** A host as a person writes one in an address: a name or an IPv4 address, of letters, digits, dots, hyphens and underscores. */
const HOST = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/** Whether `host` is an IPv6 address: hex digits, colons and dots, as the URL standard reads one. */
const isIPv6 = (host: string): boolean => /^[0-9A-Fa-f:.]+$/.test(host) && URL.canParse(`http://[${host}]/`);

/**
 * An address as `formatAddress` writes it and a person types one, read back:
 * `100.101.102.103:7447`, `gateway.example.net:7447`, or
 * `[fd7a:115c:a1e0::1]:7447` for an IPv6 address. Undefined for anything else.
 * The port is any whole number written there, and whoever reads it checks its
 * range with `isPort`.
 */
export function parseAddress(text: string): { host: string; port: number } | undefined {
  const [, bracketed, plain, port] = /^(?:\[([^\]]*)\]|([^:[\]]*)):(\d+)$/.exec(text) ?? [];
  if (port === undefined) return undefined;
  const host = bracketed ?? plain ?? "";
  return (bracketed === undefined ? HOST.test(host) : isIPv6(host)) ? { host, port: Number(port) } : undefined;
}

/** Whether `port` is a port from `lowest` to 65535: from 1 for one to dial, and from 0 where 0 has a listener pick one. */
export function isPort(port: number, lowest: 0 | 1): boolean {
  return Number.isInteger(port) && port >= lowest && port <= 65_535;
}

/** The WebSocket URL of `place`: `ws+unix:` for a socket's path, and `wss:` for an address, where every link is TLS. */
export function placeUrl(place: Place): string {
  return "path" in place ? `ws+unix:${place.path}:/` : `wss://${formatAddress(place)}/`;
}

/** `place` as a person reads it: the socket's path, or the address. */
export function describePlace(place: Place): string {
  return "path" in place ? place.path : formatAddress(place);
}
