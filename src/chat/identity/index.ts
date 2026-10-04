/**
 * Who a member is, as the chat server learns it: whose a ticket is, and who the
 * member with an ID is, both asked of the gateway's roster over the connection
 * the chat server keeps to it. It must not know what the chat server does with
 * a member, or how the connection to the gateway is kept.
 */
export { type Identity, identityFromGateway } from "./gateway.ts";
