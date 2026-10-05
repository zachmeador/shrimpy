/**
 * Who is on the network: every member with a minted ID that never changes, a
 * name that is unique among people and agents and can change, whether it is an
 * admin (every person is, and an agent is once it has been promoted), and how
 * it is recognized (a person by its operating system user, an agent by a token
 * whose hash is all that is kept). The roster is one readable file in the
 * gateway's data directory, written whole or not at all. It must not know how a
 * connection is made, what is registered, or what a member does.
 */
export { openRoster, type Roster, RosterOwnedError } from "./roster.ts";
