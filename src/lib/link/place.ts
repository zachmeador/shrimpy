/** Where a link is made: a Unix socket's path, or a host and a port. */
export type Place = { readonly path: string } | { readonly host: string; readonly port: number };

/** The WebSocket URL of `place`: `ws+unix:` for a socket's path, and `wss:` for an address, where every link is TLS. */
export function placeUrl(place: Place): string {
  return "path" in place ? `ws+unix:${place.path}:/` : `wss://${describePlace(place)}/`;
}

/** `place` as a person reads it: the socket's path, or `host:port`, with an IPv6 host in brackets. */
export function describePlace(place: Place): string {
  if ("path" in place) return place.path;
  const host = place.host.includes(":") ? `[${place.host}]` : place.host;
  return `${host}:${String(place.port)}`;
}
