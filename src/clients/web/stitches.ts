/*
 * The page's material, drawn on one stitch: dither tiles, the wool's flecks
 * and the halo of a lantern, each a small SVG for the styles to use as a mask
 * or a background, and the threshold every dither is drawn by. Nothing here
 * glows or blurs: where a value fades, it is dithered.
 */
import { path, widthOf } from "../look/index.ts";

/** One stitch, in pixels: every mark, sigil and texture is drawn on this grid. */
export const STITCH = 2;

/** An SVG `w` by `h` stitches holding `drawn`, as a `url()` for a background or a mask. */
const svgUrl = (w: number, h: number, drawn: string): string =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${String(w)} ${String(h)}' shape-rendering='crispEdges'>${drawn}</svg>`)}")`;

/** A cell of a tile, a stitch square: where it is, its color, and how opaque. */
interface Cell {
  x: number;
  y: number;
  color?: string;
  alpha?: number;
}

/** A tile `w` by `h` stitches as a `url()` for a background or a mask, its cells one square each, in black unless a cell says. */
function tile(w: number, h: number, cells: readonly Cell[]): string {
  const runs = new Map<string, string>();
  for (const { x, y, color = "#000", alpha = 1 } of cells) {
    const key = `${color} ${String(alpha)}`;
    runs.set(key, `${runs.get(key) ?? ""}M${String(x)} ${String(y)}h1v1h-1z`);
  }
  const paths = [...runs].map(([key, d]) => {
    const [color, alpha] = key.split(" ");
    return `<path fill='${color ?? "#000"}'${alpha === "1" ? "" : ` fill-opacity='${alpha ?? "1"}'`} d='${d}'/>`;
  });
  return svgUrl(w, h, paths.join(""));
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/** The ordered-dither threshold at a cell: a value beats it where the cell is on. */
export const bayer = (x: number, y: number): number => ((BAYER[y & 3]?.[x & 3] ?? 0) + 0.5) / 16;

/** A tile that is on wherever `density` beats the ordered-dither threshold. */
function dither(w: number, h: number, density: (x: number, y: number) => number): string {
  const cells: Cell[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (bayer(x, y) < density(x, y)) cells.push({ x, y });
  return tile(w, h, cells);
}

/** Numbers that look random and are the same at every build, from `seed`. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The wool: a few flecks of three colors on the ground, 128 stitches square. */
export function flecks(colors: readonly [string, string, string], seed: number): string {
  const next = rng(seed);
  const [a, b, c] = colors;
  const cells: Cell[] = [];
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const v = next();
      if (v < 0.0046) {
        cells.push({ x, y, color: a });
        if (next() < 0.35) cells.push({ x: (x + 1) % 128, y, color: a });
      } else if (v < 0.0058) cells.push({ x, y, color: b, alpha: 0.75 });
      else if (v < 0.0063) cells.push({ x, y, color: c, alpha: 0.6 });
    }
  }
  return tile(128, 128, cells);
}

/** The ground of a view that may be out of date: one stitch in eight, in `color`. */
export const mesh = (color: string): string =>
  tile(4, 4, [
    { x: 0, y: 0, color },
    { x: 2, y: 2, color },
  ]);

/** Three frames of a lantern's halo, side by side. */
function halo(): string {
  const cells: Cell[] = [];
  for (let f = 0; f < 3; f++) {
    for (let y = 0; y < 11; y++) {
      for (let x = 0; x < 11; x++) {
        const dx = x - 5;
        const dy = y - 5;
        const d = Math.hypot(dx, dy);
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) continue;
        const reach = [4.6, 5.6, 5.1][f] ?? 5;
        if (d < reach && bayer(x + f, y + f * 2) < (1 - d / reach) * 0.95) cells.push({ x: f * 11 + x, y });
      }
    }
  }
  return tile(33, 11, cells);
}

/** A bitmap, `#` for on, as a mask. */
export const bitmap = (rows: readonly string[]): string => svgUrl(widthOf(rows), rows.length, `<path d='${path(rows)}'/>`);

const FADE = [0.94, 0.78, 0.6, 0.42, 0.24, 0.1];

/** The masks the styles use, by the names they use them by. */
export const MASKS = {
  "--d-50": tile(2, 2, [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ]),
  "--d-fade-down": dither(4, 6, (_x, y) => FADE[y] ?? 0),
  "--d-fade-up": dither(4, 6, (_x, y) => FADE[5 - y] ?? 0),
  "--d-flow-v": dither(2, 16, (_x, y) => 0.5 + 0.48 * Math.sin((y / 16) * Math.PI * 2)),
  "--d-halo": halo(),
};
