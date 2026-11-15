/**
 * Where Shrimpy's programs put their Unix sockets on this machine, the check
 * that a socket's path is short enough to exist, and the check that the
 * directory is Shrimpy's own, which no other account can open. Node only, so
 * this is its only door. It knows nothing about what listens on them.
 */
export { MAX_SOCKET_PATH_BYTES, namedSocketPath, runtimeDir, socketPathFor } from "./runtime-dir.node.ts";
