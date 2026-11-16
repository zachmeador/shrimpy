/**
 * Why the gateway could not listen on an address for whoever is apart from it,
 * in plain words. The addresses it keeps between starts, and the check that an
 * address is one another machine can use, are in `contracts/gateway`, since the
 * `shrimpy` command reads and checks them too. It must not know how the entry
 * listens or who is on the roster.
 */
export { cannotListen } from "./listening.ts";
