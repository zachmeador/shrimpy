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

function woolCss(mode: Mode): string {
  const wool = WOOLS[mode];
  const props = Object.entries(GROUNDS).map(([name, key]) => `${name}:${wool[key]}`);
  for (const [name, { mark, word }] of Object.entries(wool.pigments)) props.push(`--${name}:${mark}`, `--${name}-ink:${word}`);
  props.push(`--tx-fleck:${flecks(wool.flecks, SEEDS[mode])}`, `--tx-mesh:${mesh(wool.line2)}`);
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
