/**
 * Keeping a Shrimpy folder running as a service of the operating system: which service a folder has on an account
 * (a systemd user unit on Linux, a LaunchAgent on macOS), the file that makes it, and the commands of the service
 * manager that load, restart, ask about and remove it, with lingering on Linux, which keeps an account's services
 * running when nobody is logged in. It is handed the account's own folder and what runs a command of the service
 * manager, so that a test can stand in for both and nothing reaches a real one. It must not know what `shrimpy up`
 * starts, or how a command says what it did.
 */
export { type Account, thisAccount } from "./account.ts";
export { put, remove, stateOf } from "./manage.ts";
export {
  type LaunchdService,
  type Program,
  type Service,
  serviceFor,
  STOP_SECONDS,
  type State,
  type SystemdService,
} from "./service.ts";
export { disableLingering, enableLingering, keepLingering, type Lingering, lingers } from "./systemd.ts";
