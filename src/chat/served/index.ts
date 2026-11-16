/**
 * What the chat server serves at `chat()`: for each caller a `Chat`, and a
 * `Channel` and a `Thread` for each it holds, kept live from the store, the
 * working marks and the roster, so nothing polls; `ChatPresence`, which the
 * gateway holds; and each method, answered with what it did or a refusal. A
 * working mark lasts while the hold on `Chat` that made it does. It must not
 * know how the chat server links to the gateway.
 */
export { chatFacet } from "./facet.ts";
