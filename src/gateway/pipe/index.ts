/**
 * Joining a client to a program: connect to the program's socket, and pass
 * bytes both ways with no more memory held than a few buffers, closing each
 * side as soon as the other closes. Every way into a program, the browser's
 * and the local sockets alike, ends here. It must not know what the bytes mean,
 * who sent them, or how a client came to be here.
 */
export { bridge, connectUpstream } from "./pipe.ts";
