/**
 * Where the gateway listens for agents apart from it: the addresses it was
 * told, kept in its data directory so that a start with none listens where the
 * last one did, and the check that an address is one another machine can use.
 * It must not know how an entry listens or who is on the roster.
 */
export { checkListenAddresses, keep, listeningFile, readKept } from "./listening.ts";
