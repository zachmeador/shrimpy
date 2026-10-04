/**
 * The gateway API: how programs find each other, who is on the network, how a
 * program learns who is on a connection, and how a client reaches a program by
 * its name through the gateway, which is the one way to reach a program that
 * is not a home's own agent. It must not know what the programs it connects say
 * to each other. This door is safe for browsers; `node.ts` adds the parts that
 * need Node.
 */
export { connectGateway, type GatewayConnection } from "./connect.ts";
export {
  GATEWAY_SERVER_ID,
  GATEWAY_SOCKET_NAME,
  isProgramKind,
  parseWebSocketPath,
  type WebTarget,
  webSocketPath,
} from "./endpoint.ts";
export { reachProgram, type Transports } from "./reach.ts";
export {
  type Announcement,
  Gateway,
  type Member,
  type ProgramName,
  type Registration,
  type RosterEntry,
  type Ticket,
} from "./services.ts";
export { isToken } from "./token.ts";
export { webSocketTransport } from "./web-socket.ts";
