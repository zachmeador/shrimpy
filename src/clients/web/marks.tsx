/*
 * The small things drawn on the stitch: an agent's sigil, the page's glyphs,
 * a lit lantern, the fleck of something new, the wordmark, and a shape pressed
 * into a pane. A bitmap is drawn from its rows with `path`, a pixel to the
 * unit, so it stays sharp at any whole size.
 */
import { on, path, widthOf, WORDMARK } from "../look/index.ts";
import type { Look } from "../view/index.ts";
import { GLYPHS, type GlyphName } from "./glyphs.ts";
import { STITCH } from "./stitches.ts";

/** A bitmap, `scale` pixels to each of its own, its rows as one path. */
function Bitmap({ rows, cls, scale = STITCH }: { rows: readonly string[]; cls: string; scale?: number }) {
  const w = widthOf(rows);
  const h = rows.length;
  return (
    <svg class={cls} width={w * scale} height={h * scale} viewBox={`0 0 ${String(w)} ${String(h)}`} shape-rendering="crispEdges" aria-hidden="true">
      <path d={path(rows)} />
    </svg>
  );
}

export function Glyph({ name }: { name: GlyphName }) {
  return <Bitmap rows={GLYPHS[name]} cls="px" />;
}

export function Wordmark({ label }: { label: string }) {
  return (
    <span role="img" aria-label={label}>
      <Bitmap rows={WORDMARK} cls="px" />
    </span>
  );
}

/**
 * An agent's sigil in its pigment, or the person's disc where `look` is
 * undefined. `size` is a class of the styles': 12, 24 when left out, or 36.
 */
export function Sigil({ look, size, off = false }: { look: Look | undefined; size?: "s12" | "s36"; off?: boolean }) {
  const pigment = look === undefined ? "pg-you" : `pg-${look.pigment}`;
  const cls = ["sigil", pigment, size, off ? "off" : undefined].filter((each) => each !== undefined).join(" ");
  const rows = look?.sigil ?? GLYPHS.disc;
  return (
    <svg class={cls} viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true">
      <path d={path(rows)} />
    </svg>
  );
}

export const Lamp = () => <i class="lamp" aria-hidden="true" />;

export const Fleck = () => <i class="fleck" aria-hidden="true" />;

/**
 * A bitmap set into a knitted field, with a clear moat around it and a
 * border, as the wordmark is pressed into an empty pane: each cell how deep it
 * is, 1 for the bitmap and less for the knit.
 */
function woven(rows: readonly string[], pad: number): number[][] {
  const w = widthOf(rows) + pad * 2;
  const h = rows.length + pad * 2;
  const lit = (x: number, y: number): boolean => on(rows, x - pad, y - pad);
  const near = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (lit(x + dx, y + dy)) return true;
    return false;
  };
  return Array.from({ length: h }, (_, y) =>
    Array.from({ length: w }, (_, x) => {
      if (lit(x, y)) return 1;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return 0.45;
      if (x === 1 || y === 1 || x === w - 2 || y === h - 2 || near(x, y)) return 0;
      return (x + y) & 1 ? 0.45 : 0;
    }),
  );
}

/** The cells of `depths` that are `deep`, or that are pressed but not deep, as tiles a little apart. */
function tiles(depths: number[][], deep: boolean, gap: number): string {
  let d = "";
  depths.forEach((row, y) =>
    row.forEach((depth, x) => {
      if (depth === 0 || (depth === 1) !== deep) return;
      const side = 1 - gap;
      d += `M${String(x)} ${String(y)}h${String(side)}v${String(side)}h-${String(side)}z`;
    }),
  );
  return d;
}

/** A shape pressed into a pane, tone on tone, each tile with a light edge a pixel below it: an agent's sigil, or the wordmark set into a knitted field. */
export function Relief({ sigil }: { sigil: readonly string[] | undefined }) {
  const depths = sigil === undefined ? woven(WORDMARK, 3) : sigil.map((row, y) => Array.from({ length: row.length }, (_, x) => (on(sigil, x, y) ? 1 : 0)));
  const cell = sigil === undefined ? 6 : 10;
  const w = depths[0]?.length ?? 0;
  const h = depths.length;
  const gap = 1 / cell;
  return (
    <svg class="relief" width={w * cell} height={h * cell} viewBox={`0 0 ${String(w)} ${String(h)}`} shape-rendering="crispEdges" aria-hidden="true">
      <path class="hi" d={tiles(depths, true, gap) + tiles(depths, false, gap)} transform={`translate(0 ${String(gap)})`} />
      <path d={tiles(depths, true, gap)} />
      <path class="shallow" d={tiles(depths, false, gap)} />
    </svg>
  );
}
