/**
 * The part of links that needs no Node: an address written as a link, a URL
 * and a person write it, where a link is made as a person reads it, and what a
 * host reports going wrong in the background, in words. Everything else about
 * links is behind `node.ts`. It must not know whose address it is. Safe for
 * browsers.
 */
export { hostFailure } from "./host.ts";
export { describePlace, formatAddress } from "./place.ts";
