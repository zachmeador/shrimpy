/**
 * What the console shows, as plain text and facts: for the state it is given,
 * the agents, threads or conversation on screen, what is not working, what the
 * keys do, and every sentence. Everything that came from another member, an
 * agent or a tool passes through here made harmless for a terminal, so nothing
 * downstream has to trust it. It must not know how anything is drawn, or reach
 * the network.
 */
export { farewellLine, hiddenLines, OUT_OF_DATE, QUIT_AGAIN } from "./words.ts";
export {
  type AgentsScreen,
  type MessageRow,
  type Note,
  type Row,
  type Screen,
  type ScreenOptions,
  screenOf,
  type ThreadScreen,
  type ThreadsScreen,
} from "./screen.ts";
export type { Step, Work } from "./work.ts";
