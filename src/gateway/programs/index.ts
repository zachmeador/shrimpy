/**
 * The programs linked to the gateway: an agent's or the chat server's link,
 * from its welcome until its socket closes, taken as the route to its address;
 * the presence the gateway holds at every program it knows, which keeps each
 * route there for the moment its program links; and whether each agent is
 * reachable. It must not know what a program serves or who may ask it what.
 */
export { createPrograms, type Programs } from "./programs.ts";
