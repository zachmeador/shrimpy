/**
 * Drawing the console on a terminal with pi-tui's public components, and
 * carrying the person's keys to the state: the one place that knows pi-tui and
 * what a key does. What is shown comes from the screen module as plain text and
 * facts, which says what each key does on the screen, and nothing here makes up
 * a sentence or trusts a string from another member. It must not reach the
 * network or decide what the console knows.
 */
export { type ConsoleTerminal, type Drawing, type DrawingOptions, startDrawing } from "./ui.ts";
