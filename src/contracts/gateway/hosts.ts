import { hostKind, str } from "@earendil-works/chord";

/** The gateway, the one host of its kind on a network, and Chord's relay: every program links out to it. */
export const gateway = hostKind("gateway");

/** The chat server, which links out to the gateway. */
export const chat = hostKind("chat");

/**
 * An agent, by its member ID on the roster, which links out to the gateway
 * while it runs. Because its address is its ID, renaming the agent on the
 * roster does not move it.
 */
export const agent = hostKind("agent", { id: str() });
