/**
 * A bitmap is rows of `#` for on and anything else for off, as a sigil's twelve
 * lines are. A row may be shorter than the widest one. Whether the pixel at
 * `x` across and `y` down is on: one outside the bitmap is off.
 */
export const on = (rows: readonly string[], x: number, y: number): boolean => rows[y]?.[x] === "#";

/** How many pixels across a bitmap is: as wide as its widest row. */
export const widthOf = (rows: readonly string[]): number => Math.max(0, ...rows.map((row) => row.length));

/** Where each dot of a braille cell is, two across and four down, with the bit Unicode gives it. */
const DOTS = [
  [0, 0, 1],
  [0, 1, 2],
  [0, 2, 4],
  [0, 3, 64],
  [1, 0, 8],
  [1, 1, 16],
  [1, 2, 32],
  [1, 3, 128],
] as const;

/** A bitmap as braille, each cell two dots across and four down: a sigil is six cells by three. */
export function dots(rows: readonly string[]): string[] {
  const lines: string[] = [];
  for (let y = 0; y < rows.length; y += 4) {
    let line = "";
    for (let x = 0; x < widthOf(rows); x += 2) {
      const bits = DOTS.reduce((sum, [dx, dy, bit]) => (on(rows, x + dx, y + dy) ? sum + bit : sum), 0);
      line += String.fromCodePoint(0x2800 + bits);
    }
    lines.push(line);
  }
  return lines;
}

/** A bitmap as half blocks, each cell one pixel over another: a sigil is twelve cells by six. */
export function halves(rows: readonly string[]): string[] {
  const lines: string[] = [];
  for (let y = 0; y < rows.length; y += 2) {
    let line = "";
    for (let x = 0; x < widthOf(rows); x += 1) {
      const upper = on(rows, x, y);
      const lower = on(rows, x, y + 1);
      line += upper ? (lower ? "█" : "▀") : lower ? "▄" : " ";
    }
    lines.push(line);
  }
  return lines;
}

/** A bitmap as the path of an SVG a pixel to the unit, one run of pixels to a rectangle, for a page to fill. */
export function path(rows: readonly string[]): string {
  let d = "";
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (!on(rows, x, y)) continue;
      let run = 1;
      while (on(rows, x + run, y)) run += 1;
      d += `M${String(x)} ${String(y)}h${String(run)}v1h-${String(run)}z`;
      x += run - 1;
    }
  });
  return d;
}

/** The wordmark's letters, nine rows each: two for ascenders, five for the body and two for descenders. */
const LETTERS: Record<string, readonly string[]> = {
  s: ["....", "....", ".###", "#...", ".##.", "...#", "###.", "....", "...."],
  h: ["#...", "#...", "###.", "#..#", "#..#", "#..#", "#..#", "....", "...."],
  r: ["...", "...", "#.#", "##.", "#..", "#..", "#..", "...", "..."],
  i: ["#", ".", "#", "#", "#", "#", "#", ".", "."],
  m: [".....", ".....", "##.#.", "#.#.#", "#.#.#", "#.#.#", "#.#.#", ".....", "....."],
  p: ["....", "....", "###.", "#..#", "#..#", "#..#", "###.", "#...", "#..."],
  y: ["....", "....", "#..#", "#..#", "#..#", "#..#", ".###", "...#", "###."],
};

/** "shrimpy" as a bitmap, its letters a column apart. */
export const WORDMARK: readonly string[] = Array.from({ length: 9 }, (_, y) =>
  ["s", "h", "r", "i", "m", "p", "y"].map((letter) => LETTERS[letter]?.[y] ?? "").join("."),
);
