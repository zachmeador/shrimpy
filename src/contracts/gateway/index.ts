/**
 * The gateway API: how programs find each other, who is on the network and how
 * a program learns who is on a connection, and how a browser reaches programs
 * through the gateway's WebSocket entry. It must not know what the programs it
 * connects say to each other. This door is safe for browsers;
 * `node.ts` adds the parts that need Node.
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
export {
  type Announcement,
  Gateway,
  type Joined,
  type Member,
  type ProgramName,
  type Registration,
  type RosterEntry,
} from "./services.ts";
export { webSocketTransport } from "./web-socket.ts";
