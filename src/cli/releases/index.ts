/**
 * Shrimpy's releases on GitHub: which one is the latest, what a release's package.json and changelog say, and
 * installing a release with its own install script. It reaches GitHub with curl, as the install script does, so
 * that a machine where one works, the other does too. It must not know where the install script puts a release,
 * or what a service is.
 */
export { installRelease, latestVersion, type Release, readRelease, type Section } from "./releases.ts";
