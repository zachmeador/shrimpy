/**
 * Shrimpy's version, the same constant in every program, so that peers can tell
 * when they were not built together, and the name of its release. It must not
 * know who compares versions or what a mismatch means. Safe for browsers.
 */
export { SHRIMPY_RELEASE_NAME, SHRIMPY_VERSION } from "./version.ts";
