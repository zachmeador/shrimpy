/**
 * The gateway API: how programs find each other, who is on the network, how a
 * program learns who is on a connection, and how a client reaches a program by
 * its name through the gateway, which is the one way to reach a program that
 * is not a home's own agent. It also has the link that invites an agent in from
 * apart and the ways to reach the gateway's network entry, how an agent apart,
 * which the gateway can't dial, is asked for and answers by connecting out, the
 * cases in which the gateway turns an agent away, so that the agent can tell
 * them apart, and the refusal every program makes for a call that takes an
 * admin. It must not know what the programs it connects say to each other. This
 * door is safe for browsers; `node.ts` adds the parts that need Node.
 */
export { formatAddress } from "./address.ts";
export { connectGateway, type GatewayConnection } from "./connect.ts";
export { entryTransports } from "./entry.ts";
export {
  answerPath,
  GATEWAY_SERVER_ID,
  GATEWAY_SOCKET_NAME,
  isProgramKind,
  parseAnswerPath,
  parseWebSocketPath,
  parseWebSocketRequest,
  type WebTarget,
  webSocketPath,
} from "./endpoint.ts";
export { type Link, readLink, writeLink } from "./link.ts";
export { reachProgram, type Transports } from "./reach.ts";
export { NEEDS_ADMIN, refuseNeedsAdmin, TURNED_AWAY, type TurnedAway, whyTurnedAway } from "./refusals.ts";
export {
  type Address,
  type Announcement,
  Gateway,
  type Invitation,
  type Member,
  type ProgramName,
  type Registration,
  type RosterEntry,
  type Ticket,
} from "./services.ts";
export { isToken } from "./token.ts";
export { webSocketTransport } from "./web-socket.ts";
