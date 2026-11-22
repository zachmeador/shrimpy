/**
 * The part of links that needs no Node: an address written as a link, a URL
 * and a person write it, and read back, whether a host reaches only its own
 * machine, the range of a port, where a link is
 * made as a person reads it, what a host reports going wrong in the
 * background, in words, dialing from a page, with the hello before Chord, and
 * keeping a link, dialing again after a drop. Everything else about links is
 * behind `node.ts`. It must not know whose address it is or what a hello says.
 * Safe for browsers.
 */
export { hostFailure } from "./host.ts";
export { keepLink, type KeepLinkOptions } from "./keep.ts";
export { type Linked } from "./linked.ts";
export { dialFromPage, type PageDialed, type PageDialOptions, type PageSocket } from "./page.ts";
export { describePlace, formatAddress, isLoopback, isPort, parseAddress } from "./place.ts";
