/**
 * The Node-only door of the clients' network: dialing the gateway from Node,
 * at its own socket on this machine or at its entry, which its key must prove,
 * and why linking failed, as the link's status says it. The terminal hands it
 * to the link, and tests reach a real gateway with it. Browser code must not
 * import this file.
 */
export { dialAt } from "./dial.node.ts";
