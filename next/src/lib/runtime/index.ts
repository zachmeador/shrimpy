/**
 * Where Shrimpy's programs put their Unix sockets on this machine. Node only.
 * It knows nothing about what listens on them.
 */
export { namedSocketPath, runtimeDir, socketPathFor } from "./runtime-dir.ts";
