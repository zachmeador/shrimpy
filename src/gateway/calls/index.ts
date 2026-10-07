/**
 * Calls: what the gateway makes when a client asks for an agent that is apart
 * from it, which it can't dial. A call is for one agent, has an ID that nobody
 * could guess, and is good once and for a short time. The agent is told of it
 * over the connection it registered on and answers by opening one more
 * connection, which is joined to the one that asked. It must not know how a
 * client came, how an answer arrives, what the connections carry or who the
 * members are.
 */
export { type Answerer, type Answering, CALL_MS, type Calls, type CallsOptions, createCalls } from "./calls.ts";
