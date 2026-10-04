/**
 * How the console reaches the programs it talks to: the gateway, which says
 * what is running, the chat server, where threads live, and an agent, whose
 * sessions it watches and stops. Each link is handed how to reach its program
 * instead of knowing where it is, keeps its connection across losses, and says
 * what it can and cannot do meanwhile. It must not know what is on screen, how
 * anything is drawn, or what a program says beyond its contract.
 */
export { type AgentLink, type AgentLinkOptions, keepAgent, type SessionUpdate } from "./agent.ts";
export { type ChatLink, type ChatLinkOptions, keepChat, type ThreadUpdate } from "./chat.ts";
export { keepRegistry, type Listing, type RegistryLink, type RegistryOptions } from "./registry.ts";
export { CONNECTING, Down, type LinkStatus, type Problem, problemOf, type Why } from "./status.ts";
export { localTransports, type Transports } from "./transports.ts";
