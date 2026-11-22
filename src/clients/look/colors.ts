import type { Pigment } from "../../contracts/agent/index.ts";

/** The time of day a client is drawn for. */
export type Mode = "dusk" | "day";

/** Every pigment: the ones an agent can have, and the three that mean something. */
export type PigmentName = Pigment | "ochre" | "sand" | "red";

/**
 * One wool. Its grounds run from the deepest to the one that is raised, and
 * each pigment has two forms: `mark` for something drawn, such as a bar or a
 * lantern, and `word` for small text on this wool's grounds.
 */
export interface Wool {
  /** The session as an agent sees it, and code. */
  well: string;
  /** Agents and rooms. */
  ground: string;
  /** What one agent, or one room, takes part in. */
  list: string;
  /** A thread. */
  pane: string;
  /** What is chosen or open. */
  raise: string;
  line: string;
  line2: string;
  ink: string;
  ink2: string;
  ink3: string;
  /** A shape pressed into a pane, tone on tone. */
  press: string;
  /** The water of the tide, far and near. */
  tide: string;
  tide2: string;
  /** A lantern between two pulses of its light. */
  ember: string;
  /** The flecks of the wool, for a client that can draw them. */
  flecks: readonly [string, string, string];
  pigments: Record<PigmentName, { mark: string; word: string }>;
}

const same = (color: string): { mark: string; word: string } => ({ mark: color, word: color });

/** Dusk is navy heather with cream for ink. Day is the cream, with navy for ink. */
export const WOOLS: Record<Mode, Wool> = {
  dusk: {
    well: "#171c29",
    ground: "#1c2130",
    list: "#1f2433",
    pane: "#222736",
    raise: "#2b3142",
    line: "#33394a",
    line2: "#474e60",
    ink: "#e9dfca",
    ink2: "#b9b0a0",
    ink3: "#8b90a2",
    press: "#1a1e2a",
    tide: "#29354d",
    tide2: "#374863",
    ember: "#85704e",
    flecks: ["#2b3248", "#9a563f", "#ed8b72"],
    pigments: {
      coral: same("#ed8b72"),
      peach: same("#eab48f"),
      ochre: same("#dbb066"),
      sand: same("#dbcda9"),
      moss: same("#87c0a1"),
      sky: same("#92b5d9"),
      plum: same("#cc99ba"),
      red: same("#ee6c75"),
    },
  },
  day: {
    well: "#e9dfcb",
    ground: "#eee4d1",
    list: "#f3ead8",
    pane: "#f8f0e1",
    raise: "#e4dac5",
    line: "#dcd2bd",
    line2: "#c4b9a4",
    ink: "#1d253d",
    ink2: "#4d5569",
    ink3: "#666d7e",
    press: "#e9dfcc",
    tide: "#b3cbe0",
    tide2: "#86a9cb",
    ember: "#debb7c",
    flecks: ["#c3d0dc", "#dc9a82", "#93a8c2"],
    pigments: {
      coral: { mark: "#d76549", word: "#ae4024" },
      peach: { mark: "#d59466", word: "#90502a" },
      ochre: { mark: "#d19936", word: "#845a0f" },
      sand: { mark: "#b9a373", word: "#6d5b35" },
      moss: { mark: "#4b9779", word: "#22664d" },
      sky: { mark: "#5e8dbe", word: "#335989" },
      plum: { mark: "#ab7097", word: "#794368" },
      red: { mark: "#d2495a", word: "#af2938" },
    },
  },
};

/** What each pigment that means something is for. */
export const ROLES = {
  /** Lantern light: something is working. */
  busy: "ochre",
  /** New to you, and where the keys are. */
  fresh: "coral",
  caution: "sand",
  bad: "red",
  good: "moss",
  link: "sky",
  code: "peach",
} as const satisfies Record<string, PigmentName>;
