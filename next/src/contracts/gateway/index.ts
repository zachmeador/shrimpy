/**
 * The gateway API: how programs find each other, and how a browser reaches
 * them through the gateway's WebSocket entry. It must not know what the
 * programs it connects say to each other. This door is safe for browsers.
 */
export {
  GATEWAY_SERVER_ID,
  GATEWAY_SOCKET_NAME,
  isProgramKind,
  parseWebSocketPath,
  type WebTarget,
  webSocketPath,
} from "./endpoint.ts";
export { Gateway, type Registration } from "./services.ts";
export { webSocketTransport } from "./web-socket.ts";
