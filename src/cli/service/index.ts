/**
 * Keeping a Shrimpy folder running as a service of the operating system: which service a folder has on an account
 * (a systemd user unit on Linux, a LaunchAgent on macOS), the file that makes it and what each such file on the
 * account runs, the commands of the service manager that load, restart, ask about and remove it, a restart started
 * apart from the service, which outlives the programs it stops, and lingering on Linux, which keeps an account's
 * services running when nobody is logged in. It is handed the account's own folder, what runs a command of the
 * service manager and what starts a process apart, so that a test can stand in for them and nothing reaches a real
 * one. It must not know what `shrimpy up` starts, or how a command says what it did.
 */
export { type Account, thisAccount } from "./account.ts";
export { installedPrograms, put, remove, restartApart, stateOf } from "./manage.ts";
export { type Program, type Service, serviceFor, STOP_SECONDS } from "./service.ts";
export { disableLingering, enableLingering, keepLingering, lingers } from "./systemd.ts";
