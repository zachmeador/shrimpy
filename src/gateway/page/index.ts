/**
 * The page's door: a port of its own beside the entry, for browsers alone. It
 * serves the web client's page, lets a browser in as a device of yours when
 * the page shows it an invitation's code, keeping the browser's token in a
 * cookie the page's scripts can't read, and takes the page's link from that
 * page alone, knowing the browser by its cookie. It serves HTTPS with the
 * certificate it is pointed at, or plain HTTP on this machine's own loopback
 * address. It must not know what the page shows, what a hello says or who may
 * be let in.
 */
export { openPageDoor, type PageDoor } from "./page.ts";
export { pagePlace } from "./place.ts";
