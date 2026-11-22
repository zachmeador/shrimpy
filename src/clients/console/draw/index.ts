/**
 * Drawing the console on the terminal's whole screen with pi-tui, the levels
 * side by side as the width allows, and carrying the person's keys and clicks
 * to the state: the one place that knows pi-tui, which level the keys are in
 * and what a key does, and the only one that names a key. What is shown comes
 * from the views the clients share, as plain text and facts, in the colors of
 * the look they share, and nothing here trusts a string from another member.
 * It must not reach the network or decide what the console knows.
 */
export { type Screen } from "./screen.ts";
export { type ConsoleTerminal, type Drawing, startDrawing } from "./ui.ts";
