/**
 * Text that someone else wrote, made harmless for a terminal before a client
 * shows or prints it: another member's message, what an agent's session says,
 * a tool's output. The terminal and the shell's commands both pass it through
 * here. It must not know who wrote the text or how it is shown.
 */
export { oneLine, plain } from "./plain.ts";
