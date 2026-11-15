import { hostKind, str } from "@earendil-works/chord";

/** The gateway, the one host of its kind on a network, and Chord's relay: every program links out to it. */
export const gateway = hostKind("gateway");

/** The chat server, which links out to the gateway. */
export const chat = hostKind("chat");

/**
 * An agent, by its name on the roster, which links out to the gateway while it
 * runs. A rename moves its address, and since Chord matches addresses exactly,
 * a client takes the roster's spelling.
 */
export const agent = hostKind("agent", { name: str() });
