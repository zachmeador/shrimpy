/**
 * The gateway API: how programs find each other. It must not know what the
 * programs it connects say to each other. This door is safe for browsers.
 */
export { Gateway, type Registration } from "./services.ts";
