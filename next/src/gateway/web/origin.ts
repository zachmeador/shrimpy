/**
 * Whether a page with this `Origin` may open a pipe. Nothing authenticates
 * the browser entry yet, so this is all that stops a page from another site
 * from reaching programs through the user's browser: browsers send the
 * origin on every WebSocket handshake and a page can't change it. A page
 * served by this entry has one of these two origins, whichever name for
 * loopback the user typed.
 */
export function isOwnOrigin(origin: string, port: number): boolean {
  return origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`;
}
