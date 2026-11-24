/*
 * The README's pictures, drawn on the stitch from the look the clients share:
 * the wools, the shrimp, the wordmark and the sigils an agent is given.
 * `node docs/assets/make.ts` writes them beside this file, each at dusk and by
 * day, with the card a link to the repository shows as a PNG, which GitHub
 * takes only as an upload in the repository's settings. Give it a directory
 * and it also writes each picture there as a PNG, to look at.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";
import { type Mode, on, SHRIMP, widthOf, type Wool, WOOLS, WORDMARK } from "../../src/clients/look/index.ts";
import { WALKER } from "../../src/clients/web/glyphs.ts";
import { bayer, flecks } from "../../src/clients/web/stitches.ts";
import { lookFromId } from "../../src/contracts/agent/sigil.ts";

/** A stitch is two pixels, as it is in the web client. */
const STITCH = 2;

/** One coat of a color on a cell. */
interface Coat {
  color: string;
  alpha: number;
}

/** Cells with the coats put on each, the last on top. A coat that lets nothing through replaces what was under it. */
class Cells {
  readonly coats = new Map<string, Coat[]>();

  put(x: number, y: number, color: string, alpha = 1): void {
    const key = `${x},${y}`;
    this.coats.set(key, alpha >= 1 ? [{ color, alpha }] : [...(this.coats.get(key) ?? []), { color, alpha }]);
  }

  /** A bitmap, `#` for on, each of its pixels `scale` stitches square. */
  bitmap(rows: readonly string[], left: number, top: number, scale: number, color: string): void {
    for (let y = 0; y < rows.length * scale; y++) {
      for (let x = 0; x < widthOf(rows) * scale; x++) {
        if (on(rows, Math.floor(x / scale), Math.floor(y / scale))) this.put(left + x, top + y, color);
      }
    }
  }

  /** The cells as SVG paths: one for each color at each depth of coat. */
  svg(): string {
    const depths: Map<string, [number, number][]>[] = [];
    for (const [key, coats] of this.coats) {
      const [x = 0, y = 0] = key.split(",").map(Number);
      coats.forEach((coat, depth) => {
        const colors = (depths[depth] ??= new Map());
        const name = `${coat.color} ${coat.alpha}`;
        colors.set(name, [...(colors.get(name) ?? []), [x, y]]);
      });
    }
    return depths
      .flatMap((colors) =>
        [...colors].map(([name, cells]) => {
          const [color, alpha] = name.split(" ");
          return `<path fill="${color}"${alpha === "1" ? "" : ` fill-opacity="${alpha}"`} d="${rectangles(cells)}"/>`;
        }),
      )
      .join("");
  }
}

/** Cells as the rectangles that cover them: a run along a row, and equal runs in rows that touch as one. */
function rectangles(cells: [number, number][]): string {
  const rows = new Map<number, number[]>();
  for (const [x, y] of cells) rows.set(y, [...(rows.get(y) ?? []), x]);
  const open = new Map<string, { x: number; y: number; w: number; h: number }>();
  let d = "";
  const close = (key: string): void => {
    const r = open.get(key);
    if (r === undefined) return;
    d += `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`;
    open.delete(key);
  };
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = (rows.get(y) ?? []).sort((a, b) => a - b);
    const seen = new Set<string>();
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] ?? 0;
      let w = 1;
      while (xs[i + 1] === x + w) {
        w++;
        i++;
      }
      const key = `${x} ${w}`;
      const above = open.get(key);
      if (above !== undefined && above.y + above.h === y) above.h++;
      else {
        close(key);
        open.set(key, { x, y, w, h: 1 });
      }
      seen.add(key);
    }
    for (const key of [...open.keys()]) if (!seen.has(key)) close(key);
  }
  for (const key of [...open.keys()]) close(key);
  return d;
}

/** A part of a plate: its cells, the class its styles move it by, and whether a still picture leaves it out. */
interface Part {
  cells: Cells;
  cls?: string;
  later: boolean;
}

/** The seed of each wool's flecks on a plate. */
const SEEDS: Record<Mode, number> = { dusk: 23, day: 5 };

/** The wool's flecks as the web client's styles make them: the tile's paths for an SVG, and its cells for a PNG. */
function woolTile(mode: Mode): { paths: string; cells: Map<string, Coat> } {
  const url = flecks(WOOLS[mode].flecks, SEEDS[mode]);
  const svg = decodeURIComponent(url.slice(url.indexOf(",") + 1, url.lastIndexOf('"')));
  const paths = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
  const cells = new Map<string, Coat>();
  for (const [, color = "", , alpha = "1", d = ""] of paths.matchAll(/<path fill='([^']+)'( fill-opacity='([^']+)')? d='([^']+)'\/>/g)) {
    for (const [, x = "", y = ""] of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) cells.set(`${x},${y}`, { color, alpha: Number(alpha) });
  }
  return { paths: paths.replaceAll("'", '"'), cells };
}

/** A plate: a piece of flecked wool `w` by `h` stitches with what is drawn on it, its corners cut by two stitches unless `cut` is false. */
class Plate {
  readonly parts: Part[] = [];
  readonly styles: string[] = [];
  readonly wool: Wool;
  readonly name: string;
  readonly label: string;
  readonly w: number;
  readonly h: number;
  readonly mode: Mode;
  readonly cut: boolean;

  constructor(name: string, label: string, w: number, h: number, mode: Mode, cut = true) {
    this.name = name;
    this.label = label;
    this.w = w;
    this.h = h;
    this.mode = mode;
    this.cut = cut;
    this.wool = WOOLS[mode];
  }

  /** A new part on top of the others. One with a class is moved by the plate's styles, and a `later` one is a frame after the first. */
  part(cls?: string, later = false): Cells {
    const cells = new Cells();
    this.parts.push({ cells, ...(cls === undefined ? {} : { cls }), later });
    return cells;
  }

  /** Whether a cell is on the plate, and not in a corner that is cut. */
  private has(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return false;
    if (!this.cut) return true;
    const dx = Math.min(x, this.w - 1 - x);
    const dy = Math.min(y, this.h - 1 - y);
    return dx + dy >= 2 && !(dx === 1 && dy === 1);
  }

  private outline(): string {
    const { w, h } = this;
    if (!this.cut) return `M0 0h${w}v${h}h-${w}z`;
    return `M2 0h${w - 4}v1h1v1h1v${h - 4}h-1v1h-1v1h-${w - 4}v-1h-1v-1h-1v-${h - 4}h1v-1h1z`;
  }

  svg(): string {
    const id = `${this.name}-${this.mode}`;
    const whole = `M0 0h${this.w}v${this.h}h-${this.w}z`;
    const still = "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w * STITCH}" height="${this.h * STITCH}" viewBox="0 0 ${this.w} ${this.h}" shape-rendering="crispEdges" role="img" aria-label="${this.label}">`,
      `<title>${this.label}</title>`,
      ...(this.styles.length === 0 ? [] : [`<style>${this.styles.join("")}${still}</style>`]),
      `<defs><pattern id="${id}-wool" width="128" height="128" patternUnits="userSpaceOnUse">${woolTile(this.mode).paths}</pattern><clipPath id="${id}-cut"><path d="${this.outline()}"/></clipPath></defs>`,
      `<g clip-path="url(#${id}-cut)">`,
      `<path fill="${this.wool.ground}" d="${whole}"/><path fill="url(#${id}-wool)" d="${whole}"/>`,
      ...this.parts.map(({ cells, cls }) => (cls === undefined ? cells.svg() : `<g class="${cls}">${cells.svg()}</g>`)),
      "</g></svg>",
    ].join("\n");
  }

  /** The plate as a PNG, `scale` pixels to the stitch, with what moves in its first frame. */
  png(scale = STITCH): Buffer {
    const tile = woolTile(this.mode);
    const width = this.w * scale;
    const height = this.h * scale;
    const lines = Buffer.alloc(height * (width * 4 + 1));
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (!this.has(x, y)) continue;
        let color = bytesOf(this.wool.ground);
        const fleck = tile.cells.get(`${x % 128},${y % 128}`);
        if (fleck !== undefined) color = over(color, fleck);
        for (const part of this.parts) {
          if (part.later) continue;
          for (const coat of part.cells.coats.get(`${x},${y}`) ?? []) color = over(color, coat);
        }
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) lines.set([...color, 255], (y * scale + py) * (width * 4 + 1) + 1 + (x * scale + px) * 4);
        }
      }
    }
    return pngOf(width, height, lines);
  }
}

type Bytes = [number, number, number];

/** A color written as `#rrggbb`, as its three bytes. */
function bytesOf(color: string): Bytes {
  const value = Number.parseInt(color.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

/** A color with a coat over it. */
function over(under: Bytes, coat: Coat): Bytes {
  const top = bytesOf(coat.color);
  return under.map((value, i) => Math.round(value + ((top[i] ?? 0) - value) * coat.alpha)) as Bytes;
}

/** One chunk of a PNG: its length, its type, its data and the check of both. */
function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "latin1");
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, check]);
}

/** A PNG from lines of red, green, blue and alpha, each line led by a zero for no filter. */
function pngOf(width: number, height: number, lines: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(lines)), chunk("IEND", Buffer.alloc(0))]);
}

/* --- What is drawn ---------------------------------------------------------- */

/** How deep the water is under its horizon, in stitches, in the web client's tide. */
const DEPTH = 15;

/**
 * The tide from the horizon at `hz` down to the plate's foot, as the web
 * client draws it over the list of agents: a horizon, and rows of dashes that
 * lengthen toward the front. Each row is a part of its own that drifts a
 * stitch a second, odd rows one way and even rows the other.
 */
function tide(plate: Plate, hz: number): void {
  const { wool, w } = plate;
  const deep = plate.h - hz;
  for (let row = 0, y = hz + 2; y < plate.h; row++, y += 2) {
    const depth = (y - hz) / deep;
    const period = 9 + ((row * 5) % 7);
    const dash = 2 + Math.round(depth * (period - 5));
    const cells = plate.part(`t${row}`);
    for (let x = -period; x < w + period; x++) {
      const u = (((x + row * 7) % period) + period) % period;
      if (u < dash) cells.put(x, y, depth > 0.55 ? wool.tide2 : wool.tide);
    }
    plate.styles.push(`.t${row}{animation:t${row} ${period}s steps(${period}) infinite}@keyframes t${row}{to{transform:translate(${row % 2 ? -period : period}px)}}`);
  }
  const horizon = plate.part();
  for (let x = 0; x < w; x += 2) horizon.put(x, hz, wool.tide2);
}

/** A lantern on the horizon at `cx`: lit while its agent works, and dim while the agent isn't running. */
interface Lantern {
  cx: number;
  lit: boolean;
  running: boolean;
}

/** Lanterns by how far each stands from the plate's right edge, with whether it is lit and whether its agent is running. */
const along = (plate: Plate, spots: readonly (readonly [number, boolean, boolean])[]): Lantern[] =>
  spots.map(([fromRight, lit, running]) => ({ cx: plate.w - fromRight, lit, running }));

/**
 * Lanterns, as the web client draws them. The light of a lit one is three
 * frames, its halo and what the water gives back of it, each shown for half a
 * second in turn.
 */
function lanterns(plate: Plate, hz: number, all: readonly Lantern[]): void {
  const { wool } = plate;
  const light = wool.pigments.ochre.mark;
  for (let frame = 0; frame < 3; frame++) {
    const cells = plate.part(`l l${frame}`, frame > 0);
    for (const { cx, lit } of all) {
      if (!lit) continue;
      const reach = [4.4, 5.4, 4.9][frame] ?? 5;
      for (let dy = -6; dy <= 0; dy++) {
        for (let dx = -6; dx <= 6; dx++) {
          const dist = Math.hypot(dx, dy + 2);
          if (dist < reach && bayer(cx + dx, hz - 2 + dy) < (1 - dist / reach) * 0.7) cells.put(cx + dx, hz - 2 + dy, light, 0.42);
        }
      }
      for (let k = 2; k <= 12; k += 2) {
        const sway = (k / 2 + frame) % 3 === 0 ? 1 : 0;
        for (let dx = -1; dx <= (k < 8 ? 1 : 0); dx++) cells.put(cx + dx + sway, hz + k, light, Math.round((1 - k * 0.055) * 100) / 100);
      }
    }
  }
  plate.styles.push(".l{animation:l 1.5s step-end infinite}.l1{opacity:0;animation-delay:-1s}.l2{opacity:0;animation-delay:-.5s}@keyframes l{0%{opacity:1}33.33%{opacity:0}}");
  const bodies = plate.part();
  for (const { cx, lit, running } of all) {
    const body = lit ? light : wool.line2;
    const alpha = running ? 1 : 0.45;
    bodies.put(cx, hz - 4, body, alpha);
    for (let dy = -3; dy <= -1; dy++) for (let dx = -1; dx <= 1; dx++) bodies.put(cx + dx, hz + dy, body, alpha);
    if (lit) bodies.put(cx, hz - 2, wool.pigments.sand.mark);
  }
}

/** The shrimp and the wordmark side by side, each pixel `scale` stitches, with the shrimp's top left at `left` and `top`. */
function lockup(cells: Cells, wool: Wool, left: number, top: number, scale: number): void {
  cells.bitmap(SHRIMP, left, top, scale, wool.pigments.coral.mark);
  const drop = Math.round(((SHRIMP.length - WORDMARK.length) * scale) / 2);
  cells.bitmap(WORDMARK, left + (widthOf(SHRIMP) + 2) * scale, top + drop, scale, wool.ink);
}

/** The banner: the shrimp and the wordmark over the tide, with a lantern for each of seven agents, three of them working. */
function banner(mode: Mode): Plate {
  const plate = new Plate("banner", "Shrimpy", 400, 72, mode);
  const hz = plate.h - DEPTH;
  tide(plate, hz);
  lanterns(plate, hz, along(plate, [[14, false, true], [25, true, true], [36, false, true], [80, true, true], [91, false, false], [146, false, true], [190, true, true]]));
  lockup(plate.part(), plate.wool, 14, 12, 3);
  return plate;
}

/** The names the sigils are worked out from, as a client works one out from an agent's ID when the agent shows none. */
const AGENTS = ["scout", "cy", "mole", "ada", "heron", "anchor", "crab", "ledger", "bo", "buoy"];

/** Sigils in a row, each in its pigment, as agents are given them. */
function sigils(mode: Mode): Plate {
  const scale = 2;
  const gap = 14;
  const side = 12 * scale;
  const plate = new Plate("sigils", "Ten sigils: small creatures and emblems, each twelve pixels square", 400, side + 28, mode);
  const cells = plate.part();
  const left = Math.round((plate.w - AGENTS.length * side - (AGENTS.length - 1) * gap) / 2);
  AGENTS.forEach((id, i) => {
    const look = lookFromId(id);
    cells.bitmap(look.sigil, left + i * (side + gap), 14, scale, plate.wool.pigments[look.pigment].mark);
  });
  return plate;
}

/** The two steps of the shrimp's walk, apart. */
const STEPS = [WALKER.map((row) => row.slice(0, widthOf(SHRIMP))), WALKER.map((row) => row.slice(widthOf(SHRIMP)))];

/** The foot of the page: the tide, and the shrimp walking along it as it does while an agent works, at a slower pace. */
function foot(mode: Mode): Plate {
  const plate = new Plate("tide", "The shrimp walking along the tide", 400, 32, mode);
  const hz = plate.h - DEPTH;
  tide(plate, hz);
  lanterns(plate, hz, along(plate, [[30, true, true], [41, false, true], [118, false, false], [129, true, true], [222, false, true]]));
  STEPS.forEach((step, i) => plate.part(`w w${i}`, i > 0).bitmap(step, 40, hz - SHRIMP.length + 1, 1, plate.wool.pigments.coral.mark));
  plate.styles.push(
    ".w{animation:legs 1s step-end infinite,walk 2s step-end infinite}.w1{opacity:0;animation-delay:-.5s,0s}",
    "@keyframes legs{0%{opacity:1}50%{opacity:0}}@keyframes walk{25%{transform:translate(3px)}50%{transform:translate(6px)}75%{transform:translate(3px)}}",
  );
  return plate;
}

/** The card a link to the repository shows, 1280 by 640: the banner's scene at dusk on deeper water, with no corner cut, four pixels to the stitch. */
function card(): Plate {
  const plate = new Plate("social-preview", "Shrimpy", 320, 160, "dusk", false);
  const hz = plate.h - 27;
  tide(plate, hz);
  lanterns(plate, hz, along(plate, [[24, false, true], [35, true, true], [46, false, true], [101, true, true], [112, false, false], [178, false, true], [233, true, true], [244, false, true], [290, false, true]]));
  const scale = 4;
  lockup(plate.part(), plate.wool, Math.round((plate.w - (widthOf(SHRIMP) + 2 + widthOf(WORDMARK)) * scale) / 2), 38, scale);
  return plate;
}

/* --- Writing them ----------------------------------------------------------- */

const here = fileURLToPath(new URL(".", import.meta.url));
const look = process.argv[2];
if (look !== undefined) mkdirSync(look, { recursive: true });

for (const mode of ["dusk", "day"] as const) {
  for (const plate of [banner(mode), sigils(mode), foot(mode)]) {
    writeFileSync(`${here}${plate.name}-${mode}.svg`, `${plate.svg()}\n`);
    if (look !== undefined) writeFileSync(`${look}/${plate.name}-${mode}.png`, plate.png());
  }
}
writeFileSync(`${here}social-preview.png`, card().png(4));
