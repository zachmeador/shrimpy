/**
 * The programs that are running on this machine, as the gateway knows them:
 * one registration per live connection, with what only the gateway is told
 * about each (its server ID and the socket it is piped to), and what clients
 * are told, which is neither. It must not know how a connection is made or
 * what the registered programs do, so it only hears when a connection
 * registers and when it ends.
 */
export {
  checkAnnouncement,
  createRegistry,
  InvalidRegistrationError,
  type Registered,
  type Registrant,
  type Registry,
} from "./registry.ts";
