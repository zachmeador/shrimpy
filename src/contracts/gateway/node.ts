/**
 * The Node-only door of the gateway's contract: the one dial every link to the
 * gateway and every join starts with, at its own socket or at its entry once
 * the gateway's key proves it; linking a client once, and keeping a program
 * or a client linked; the file in which a machine of yours keeps its place as one of your
 * devices; the addresses the gateway keeps for its entry, and the check that an
 * address is one another machine can use; and making a token. Browser code must
 * not import this file.
 */
export { connectGateway, type ConnectGatewayOptions, type GatewayClient } from "./connect.node.ts";
export {
  dialGateway,
  type DialGatewayOptions,
  type GatewayDialed,
  type GatewayPlace,
  GatewayRefusedError,
  UnknownAnswerError,
  UnprovenGatewayError,
} from "./dial.node.ts";
export { keepLinked, type KeepLinkedOptions } from "./keep.node.ts";
export { checkListenAddresses, keepListenAddresses, keptListenAddresses, listenAddressesFile } from "./listening.node.ts";
export { readMachine, saveMachine } from "./machine.node.ts";
export { gatewaySocket } from "./socket.node.ts";
export { newToken } from "./token.node.ts";
