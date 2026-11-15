/**
 * Where the gateway listens for whoever is apart from it: the addresses it was
 * told, kept in its data directory so that a start with none listens where the
 * last one did, the check that an address is one another machine can use, and
 * why an address could not be listened on. It must not know how the entry
 * listens or who is on the roster.
 */
export { cannotListen, checkListenAddresses, keep, listeningFile, readKept } from "./listening.ts";
