/*
 * The page's styles that come from the look both clients share: each wool's
 * colors and pigments as custom properties, what each pigment is for, each
 * agent's pigment as a class, and the material drawn in them. The rest of the
 * styles, which only use these names, are in page.css.
 */
import { PIGMENTS } from "../../contracts/agent/index.ts";
import { type Mode, ROLES, type Wool, WOOLS } from "../look/index.ts";
import { WALKER } from "./glyphs.ts";
import { bitmap, flecks, MASKS, mesh } from "./stitches.ts";

/** Each wool's grounds, lines and inks, by the names the styles use. */
const GROUNDS: Record<string, Exclude<keyof Wool, "flecks" | "pigments">> = {
  "--well": "well",
  "--ground": "ground",
  "--list": "list",
  "--pane": "pane",
  "--raise": "raise",
  "--line": "line",
  "--line-2": "line2",
  "--ink": "ink",
  "--ink-2": "ink2",
  "--ink-3": "ink3",
  "--press": "press",
  "--tide": "tide",
  "--tide-2": "tide2",
  "--ember": "ember",
};

/** The seed of each wool's flecks, so each keeps its own pattern. */
const SEEDS: Record<Mode, number> = { dusk: 7, day: 11 };

const FLECKED: readonly (readonly [string, "ground" | "list" | "pane" | "well"])[] = [
  ["--tx-fleck", "ground"],
  ["--tx-fleck-list", "list"],
  ["--tx-fleck-pane", "pane"],
  ["--tx-fleck-well", "well"],
];

const channels = (color: string): number[] => [1, 3, 5].map((at) => Number.parseInt(color.slice(at, at + 2), 16));

const hexOf = (values: readonly number[]): string =>
  `#${values.map((value) => Math.min(255, Math.max(0, value)).toString(16).padStart(2, "0")).join("")}`;

function flecksOn(wool: Wool, ground: string): readonly [string, string, string] {
  const [from, to] = [channels(wool.ground), channels(ground)];
  const shift = (color: string): string => hexOf(channels(color).map((value, at) => value + (to[at] ?? 0) - (from[at] ?? 0)));
  return [shift(wool.flecks[0]), shift(wool.flecks[1]), shift(wool.flecks[2])];
}

function woolCss(mode: Mode): string {
  const wool = WOOLS[mode];
  const props = Object.entries(GROUNDS).map(([name, key]) => `${name}:${wool[key]}`);
  for (const [name, { mark, word }] of Object.entries(wool.pigments)) props.push(`--${name}:${mark}`, `--${name}-ink:${word}`);
  FLECKED.forEach(([name, ground], at) => props.push(`${name}:${flecks(flecksOn(wool, wool[ground]), SEEDS[mode] + at * 100)}`));
  props.push(`--tx-mesh:${mesh(wool.line2)}`);
  return `[data-mode="${mode}"]{${props.join(";")}}`;
}

/** The styles that come from the look, for the top of the page's stylesheet. */
export function lookCss(): string {
  const roles = Object.entries(ROLES).map(([role, pigment]) => `--${role}:var(--${pigment});--${role}-ink:var(--${pigment}-ink)`);
  const masks = Object.entries({ ...MASKS, "--bm-walker": bitmap(WALKER) }).map(([name, url]) => `${name}:${url}`);
  const agents = PIGMENTS.map((pigment) => `.pg-${pigment}{--who:var(--${pigment});--who-ink:var(--${pigment}-ink)}`);
  return [`:root{${masks.join(";")}}`, woolCss("dusk"), woolCss("day"), `[data-mode]{${roles.join(";")}}`, ...agents].join("\n");
}

/** The color of the page behind everything, for what a browser draws before the page: the pane at dusk. */
export const BACKDROP = WOOLS.dusk.pane;
