/**
 * Drawing the console on a terminal with pi-tui's public components, a level
 * at a time, and carrying the person's keys to the state: the one place that
 * knows pi-tui, which level is in front and what a key does, and the only one
 * that names a key. What is shown comes from the views the clients share, as
 * plain text and facts, and nothing here trusts a string from another member.
 * It must not reach the network or decide what the console knows.
 */
export { type Screen } from "./screen.ts";
export { type ConsoleTerminal, type Drawing, startDrawing } from "./ui.ts";
