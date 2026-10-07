/**
 * The programs that are running, as the gateway knows them: one registration
 * per live connection, with what only the gateway is told about each (its
 * server ID, the socket it is piped to, which an agent apart from the gateway
 * has none of, and the connection it registered on), and what clients are told,
 * which is none of these. It must not know how a connection is made or what the
 * registered programs do, so it only hears when a connection registers and when
 * it ends.
 */
export {
  checkAnnouncement,
  createRegistry,
  InvalidRegistrationError,
  type Registered,
  type Registrant,
  type Registry,
} from "./registry.ts";
