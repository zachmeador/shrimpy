/**
 * Test support for the console's state: a gateway, a chat server and agents as
 * stand-ins on real sockets, and a console state talking to them. Only tests
 * and test fixtures import this, and it must not know how anything is drawn.
 */
export { me, type Rig, type RigOptions, startRig } from "./rig.ts";
