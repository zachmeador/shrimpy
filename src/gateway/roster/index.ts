/**
 * Who is on the network: you, the one person, made with the roster and found
 * as the one person there is, and every agent, each with a minted ID that
 * never changes, a name that is unique among members and can change, whether
 * it is an admin (you are, the first agent starts as one, and any other agent
 * is once it has been promoted), and its ways in (yours a token each of your
 * devices keeps, an agent's its token, of which only hashes are kept). The
 * roster is one readable file in the gateway's data directory, written whole
 * or not at all. It must not know how a connection is made, what is linked, or
 * what a member does.
 */
export { openRoster, type Recognized, type Roster, RosterOwnedError } from "./roster.ts";
