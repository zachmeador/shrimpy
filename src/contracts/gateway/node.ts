/**
 * The Node-only door of the gateway's contract: the hello every link and every
 * join starts with, said at the gateway's own socket, at its entry once the
 * gateway's key proves it, or at an agent's home socket, and its refusal;
 * linking a client once, and keeping a program or a client linked, with where a
 * program stands with the gateway told once each time it changes; the file in
 * which a machine of yours keeps its place as one of your devices; the
 * addresses the gateway keeps for its entry, and the check that an address is
 * one another machine can use; and making a token. Browser code must not
 * import this file.
 */
export { connectClient, type ConnectOptions } from "./connect.node.ts";
export { HelloRefusedError, sayHello, UnknownAnswerError, UnprovenGatewayError } from "./dial.node.ts";
export { keepLinked, reportLinking } from "./keep.node.ts";
export {
  checkListenAddresses,
  keepListenAddresses,
  keptListenAddresses,
  listenAddressesFile,
} from "./listening.node.ts";
export { readMachine, saveMachine } from "./machine.node.ts";
export { gatewaySocket } from "./socket.node.ts";
export { newToken } from "./token.node.ts";
