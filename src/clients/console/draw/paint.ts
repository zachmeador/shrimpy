import {
  backgroundAnsi,
  type Color,
  foregroundAnsi,
  indexedColor,
  parseColor,
  styleTextWithAnsi,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";
import { type Mode, type PigmentName, ROLES, WOOLS } from "../../look/index.ts";

/**
 * What the console is drawn in: one of the two wools, on a terminal that has
 * true color, with its grounds painted, or the terminal's own sixteen colors,
 * with no ground painted at all.
 */
export type Wool = Mode | "own";

/** The grounds: the agents and rooms, a list, a thread, an agent's view and code, and what is chosen or open. */
export type Ground = "ground" | "list" | "pane" | "well" | "raise";

/**
 * A tone words and marks are drawn in. A pigment by its name is its form for
 * words, and with " mark" after it the brighter form for marks. A ground's
 * name is its color, for a mark that has to meet a ground, as a stepped corner does.
 */
export type Tone = "ink" | "ink2" | "ink3" | "line" | "line2" | "press" | "tide" | "tide2" | "ember" | PigmentName | `${PigmentName} mark` | Ground;

/** What a pigment that means something is for, as the look names it: busy, fresh, caution, bad, good, link and code. */
export type Role = keyof typeof ROLES;

/** The tone of a role: its pigment's form for words, or with `mark` its brighter form for marks. */
export const role = (name: Role, mark = false): Tone => (mark ? `${ROLES[name]} mark` : ROLES[name]);

export interface Style {
  tone?: Tone;
  on?: Ground;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

/** A run of text in one style: the cells a line is made of. */
export type Run = readonly [text: string, style: Style | Tone];

/** How the console paints, in one wool. */
export interface Paint {
  readonly wool: Wool;
  /** `text` in a style. */
  text(text: string, style: Style | Tone): string;
  /** Runs, each in its style, as one string. */
  runs(runs: readonly Run[]): string;
  /**
   * `line` made `width` cells wide on a ground, which stays under every style
   * in it, with ink as the color of what has none. Where no ground is painted
   * the line is only padded, and what is chosen is the terminal's bright black.
   */
  lay(line: string, width: number, on: Ground): string;
}

/** The pigments as the terminal's own colors: its sixteen, by number, as a terminal names them. */
const OWN_PIGMENTS: Record<PigmentName, number> = { coral: 1, peach: 6, ochre: 3, sand: 3, moss: 2, sky: 4, plum: 5, red: 1 };

/**
 * The terminal's own colors for what is not a pigment. Ink is the terminal's
 * own, and what matters less is ink, dimmed. Of the grounds only what is chosen
 * has a color, the terminal's bright black.
 */
const OWN_INKS: Record<Exclude<Tone, PigmentName | `${PigmentName} mark`>, { color?: number; dim?: boolean }> = {
  ink: {},
  ink2: { color: 7 },
  ink3: { dim: true },
  line: { color: 8 },
  line2: { color: 8 },
  press: { color: 8 },
  tide: { color: 8, dim: true },
  tide2: { color: 8 },
  ember: { color: 3, dim: true },
  ground: {},
  list: {},
  pane: {},
  well: {},
  raise: { color: 8 },
};

const RESETS = /\u001b\[(?:0|39|49)?m/g;
const END = "\u001b[39;49m";

export function createPaint(wool: Wool): Paint {
  const fg = new Map<Tone, { ansi: string | undefined; dim: boolean }>();
  const toneOf = (tone: Tone): { ansi: string | undefined; dim: boolean } => {
    let found = fg.get(tone);
    if (found === undefined) {
      found = wool === "own" ? ownTone(tone) : { ansi: foregroundAnsi(woolColor(wool, tone), "truecolor"), dim: false };
      fg.set(tone, found);
    }
    return found;
  };
  const bgOf = (on: Ground): string | undefined => {
    if (wool === "own") return on === "raise" ? backgroundAnsi(indexedColor(8), "truecolor") : undefined;
    return backgroundAnsi(parseColor(WOOLS[wool][on]), "truecolor");
  };
  // What a line on each ground starts with, and starts again with after a style in it ends.
  const bases = new Map<Ground, string>();
  const baseOf = (on: Ground): string => {
    let base = bases.get(on);
    if (base === undefined) {
      base = `${bgOf(on) ?? ""}${wool === "own" ? "" : (toneOf("ink").ansi ?? "")}`;
      bases.set(on, base);
    }
    return base;
  };

  const text = (words: string, style: Style | Tone): string => {
    const { tone, on, bold, italic, underline, strike }: Style = typeof style === "string" ? { tone: style } : style;
    const ink = tone === undefined ? undefined : toneOf(tone);
    return styleTextWithAnsi(words, ink?.ansi, on === undefined ? undefined : bgOf(on), {
      bold,
      italic,
      underline,
      strikethrough: strike,
      dim: ink?.dim === true,
    });
  };
  return {
    wool,
    text,
    runs: (runs) => runs.map(([words, style]) => text(words, style)).join(""),
    lay(line, width, on) {
      const padding = " ".repeat(Math.max(0, width - visibleWidth(line)));
      const base = baseOf(on);
      if (base === "") return `${line}${padding}`;
      return `${base}${line.replace(RESETS, (reset) => `${reset}${base}`)}${padding}${END}`;
    },
  };
}

function woolColor(mode: Mode, tone: Tone): Color {
  const wool = WOOLS[mode];
  if (tone.endsWith(" mark")) return parseColor(wool.pigments[tone.slice(0, -" mark".length) as PigmentName].mark);
  if (tone in wool.pigments) return parseColor(wool.pigments[tone as PigmentName].word);
  return parseColor(wool[tone as keyof typeof OWN_INKS]);
}

function ownTone(tone: Tone): { ansi: string | undefined; dim: boolean } {
  const pigment = (tone.endsWith(" mark") ? tone.slice(0, -" mark".length) : tone) as PigmentName;
  if (pigment in OWN_PIGMENTS) return { ansi: foregroundAnsi(indexedColor(OWN_PIGMENTS[pigment]), "truecolor"), dim: false };
  const { color, dim } = OWN_INKS[tone as keyof typeof OWN_INKS];
  return { ansi: color === undefined ? undefined : foregroundAnsi(indexedColor(color), "truecolor"), dim: dim === true };
}

/** How many cells runs take. */
export const runsWidth = (runs: readonly Run[]): number => runs.reduce((sum, [words]) => sum + visibleWidth(words), 0);

/** Runs cut to `max` cells, with a mark where they were cut. */
export function cutRuns(runs: readonly Run[], max: number): Run[] {
  if (runsWidth(runs) <= max) return [...runs];
  const out: Run[] = [];
  let left = Math.max(0, max);
  for (const [words, style] of runs) {
    if (left <= 0) break;
    const width = visibleWidth(words);
    if (width < left) {
      out.push([words, style]);
      left -= width;
    } else {
      out.push([truncateToWidth(words, left, "…"), style]);
      left = 0;
    }
  }
  return out;
}

/** The terminal's background is light: day is drawn on it, and dusk on a dark one. */
export const isLight = (background: { r: number; g: number; b: number }): boolean =>
  (0.2126 * background.r + 0.7152 * background.g + 0.0722 * background.b) / 255 > 0.5;
