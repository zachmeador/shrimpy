/**
 * What a client shows, as plain text and facts: for the state it is given,
 * the agents, threads, conversation or watched session on screen,
 * what is not working, what the keys do, what can be written after a slash and
 * what comes of it, and every sentence. Everything that
 * came from another member, an
 * agent or a tool passes through here made harmless for a terminal, so nothing
 * downstream has to trust it. It must not know how anything is drawn, or reach
 * the network.
 */
export { type CommandLine, type ModelLine, modelLines, writtenIn } from "./commands.ts";
export {
  farewellLine,
  hiddenLines,
  type InFull,
  type ListFilter,
  MODEL_DEFAULT,
  OUT_OF_DATE,
  QUIT_AGAIN,
  READ_ONLY_TAG,
} from "./words.ts";
export { type MessageRow, type Row, type Screen, screenOf, type SessionScreen, type StatusBlock, type ThreadScreen } from "./screen.ts";
export type { Step, Work } from "./work.ts";
