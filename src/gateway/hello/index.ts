/**
 * The hello: who a connection is, from what it shows and the door it came in
 * by, and what the gateway answers. A client's link is stamped with who it is,
 * a program's becomes its route, and a join lets an agent or a device of yours
 * in with an invitation. Every answer carries the gateway's Shrimpy version and
 * Pi packages, and a hello on other Pi packages is turned away. It must not
 * know how a link is listened for, or what is held over one.
 */
export { type Door, greeter, type HelloDeps } from "./hello.ts";
