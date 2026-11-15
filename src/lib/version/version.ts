/** The version of Shrimpy this code belongs to. A test keeps it equal to the version in package.json. */
export const SHRIMPY_VERSION = "0.0.0";

/** The name of the public release this code leads up to, shown beside the version on the terminal's first screen. It changes with each public release, and `AGENTS.md` has the rule for the name. */
export const SHRIMPY_RELEASE_NAME = "A Rising Tide";

/**
 * The Pi packages this code runs, each at its exact version. Chord's wire has
 * changed without a new protocol version, so programs compare these when they
 * link and refuse a difference. A test keeps them equal to package.json's.
 */
export const PI_PACKAGES: Readonly<Record<string, string>> = {
  "@earendil-works/chord": "1.5.2",
  "@earendil-works/pi-ai": "1.5.2",
  "@earendil-works/pi-durable": "1.5.2",
  "@earendil-works/pi-schema": "1.5.2",
  "@earendil-works/pi-tui": "1.5.2",
};
