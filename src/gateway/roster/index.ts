/**
 * Who is on the network: you, the one person, made with the roster and found
 * as the one person there is, and every agent, each with a minted ID that
 * never changes, a name that is unique among members and can change, whether
 * it is an admin (you are, the first agent starts as one, and any other agent
 * is once it has been promoted), and its ways in (yours a token each of your
 * devices keeps, an agent's its token, of which only hashes are kept), with
 * where each device of yours that asked is told things, which goes when the
 * device is taken back. The roster is one readable file in the gateway's data
 * directory, written whole or not at all. It must not know how a connection is
 * made, what is linked, what a member does or how a device is told anything.
 */
export { openRoster, type Roster } from "./roster.ts";
