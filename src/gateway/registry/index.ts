/**
 * The programs that are running on this machine, as the gateway knows them:
 * one registration per live connection. It must not know how a connection is
 * made or what the registered programs do, so it only hears when a
 * connection registers and when it ends.
 */
export {
  checkAnnouncement,
  createRegistry,
  InvalidRegistrationError,
  type Registrant,
  type Registry,
} from "./registry.ts";
