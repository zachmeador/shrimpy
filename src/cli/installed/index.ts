/**
 * The folders the install script puts Shrimpy in, under an account's home: one for each version, one for each Node
 * a version runs on, and the `shrimpy` command, which runs the version installed last. It says whether this Shrimpy
 * runs from them, which versions are there, the command that runs one and the versions a list of paths lies in, it
 * holds them for one update at a time, and it removes the versions and the Nodes no longer wanted. It must not know
 * where a release comes from, or what a service is.
 */
export {
  commandOf,
  type Installed,
  installedIn,
  isVersion,
  REMOVE_INSTALL,
  removeAllBut,
  SHRIMPY_ROOT,
  takeInstallLock,
  thisInstall,
  versionsHolding,
} from "./installed.ts";
