/**
 * The part of links that needs no Node: an address written as a link, a URL
 * and a person write it. Everything else about links is behind `node.ts`. It
 * must not know whose address it is. Safe for browsers.
 */
export { formatAddress } from "./place.ts";
