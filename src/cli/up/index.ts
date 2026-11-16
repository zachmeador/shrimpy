/**
 * Starting what is missing on this machine and keeping it running, which is
 * what `shrimpy up` does: what there is to start, the gateway, the chat server
 * and the agents as processes of their own, an agent kept running at each home
 * of the Shrimpy folder, and stopping what was started, agents first. It must
 * not know how a command reads its arguments, or how a program works inside.
 */
export { bringUp } from "./bring-up.ts";
export { PACE, type Pace } from "./pace.ts";
export { alreadyRunning, type Plan, planUp } from "./plan.ts";
