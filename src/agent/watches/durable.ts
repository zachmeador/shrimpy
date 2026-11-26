/**
 * Live watches on other agents' replies in DM threads. Posting to another
 * agent's DM opens a watch here; chat's feed settles it when that agent leaves
 * a non-`skipped` receipt on the post; archiving the DM thread or calling
 * `Agent.cancelWatch` drops it silently.
 */
export { createWatches, settleWatch, type Watches } from "./watches.durable.ts";
