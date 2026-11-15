/**
 * Who members are, as the chat server learns it: from the gateway's roster,
 * which it holds live over its own link to the gateway, and from nobody else.
 * Names, kinds and who is an admin are read from it when they are needed, so a
 * rename or a promotion counts at once. It must not know what the chat server
 * does with a member.
 */
export { createIdentity, type Identity, type LiveIdentity } from "./roster.ts";
