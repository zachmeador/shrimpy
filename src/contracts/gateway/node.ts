/**
 * The Node-only door of the gateway's contract: the one dial every link to the
 * gateway and every join starts with, at its own socket or at its entry once
 * the gateway's key proves it; linking
 * as a client, once or kept, or as a program; joining a machine of yours as a
 * device, with the file in its Shrimpy folder that says so; and making a token.
 * Browser code must not import this file.
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
export { type JoinAsMachineOptions, joinAsMachine, type MachineJoined, MachineJoinFailedError } from "./join-machine.node.ts";
export {
  keepClientLinked,
  type KeepClientLinkedOptions,
  keepProgramLinked,
  type KeepProgramLinkedOptions,
} from "./keep.node.ts";
export { readMachine, saveMachine } from "./machine.node.ts";
export { gatewaySocket } from "./socket.node.ts";
export { newToken } from "./token.node.ts";
