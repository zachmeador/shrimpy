/**
 * Whether a page with this `Origin` may open a pipe. Nothing authenticates
 * the browser entry yet, so the origin is what keeps a page from another site
 * from reaching programs through the user's browser: browsers send it with
 * every WebSocket handshake and a page can't change it. A page this entry
 * serves has one of these two origins, whichever name for loopback was typed.
 */
export function isOwnOrigin(origin: string, port: number): boolean {
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}
