/** The pigments an agent can have. The web client's other pigments mean things: ochre is work, sand is caution and red is failure. */
export const PIGMENTS = ["coral", "peach", "moss", "sky", "plum"] as const;
export type Pigment = (typeof PIGMENTS)[number];

/** How many lines a sigil has, and how many characters each line has. */
const S = 12;

const ON = "#";
const OFF = ".";
const LINE = /^[#.]{12}$/;

/**
 * The lines of a sigil from the text of a `sigil` file: twelve lines of twelve
 * characters, `#` for on and `.` for off. Blank lines before and after them, and
 * spaces at the end of a line, don't count. Anything else is no sigil, and
 * gives undefined.
 */
export function parseSigil(text: string): string[] | undefined {
  const lines = text.split("\n").map((line) => line.trimEnd());
  while (lines[0] === "") lines.shift();
  while (lines.at(-1) === "") lines.pop();
  return lines.length === S && lines.every((line) => LINE.test(line)) ? lines : undefined;
}

/** A sigil as its file holds it. */
export const formatSigil = (lines: readonly string[]): string => `${lines.join("\n")}\n`;

/** A pigment picked by `random`, which gives numbers from 0 up to 1, as `Math.random` does. */
export function pickPigment(random: () => number): Pigment {
  return diceOf(random).pick(PIGMENTS);
}

/**
 * A sigil made from the numbers `random` gives, which run from 0 up to 1, as
 * `Math.random` does, and from nothing else, so the same numbers make the same
 * sigil anywhere. It is a small creature or an emblem, the same left to right,
 * neither nearly empty nor nearly full. It uses only arithmetic that every
 * JavaScript engine does alike, so a browser makes the one the terminal makes:
 * no `**`, and no `Math` function that rounds, such as `sqrt` or `hypot`.
 */
export function makeSigil(random: () => number): string[] {
  const dice = diceOf(random);
  for (let tries = 0; tries < TRIES; tries += 1) {
    const grid = dice.chance(0.7) ? creature(dice) : emblem(dice);
    if (fits(grid)) return linesOf(centered(grid));
  }
  return [...FALLBACK];
}

/**
 * The sigil and the pigment an agent has when its home says nothing of them,
 * worked out from its member ID, so that every client draws the same one.
 */
export function lookFromId(id: string): { sigil: string[]; pigment: Pigment } {
  const random = randomFrom(id);
  return { pigment: pickPigment(random), sigil: makeSigil(random) };
}

/** How many sigils are drawn before the maker settles for its fallback. */
const TRIES = 40;

/** The fewest and the most cells a made sigil has on, of 144. */
const FEWEST = 30;
const MOST = 92;

/** The sigil made when every try fails, as a source that gives the same number every time could make it. */
const FALLBACK = [
  "............",
  "............",
  "...#....#...",
  "....#..#....",
  "...######...",
  "..##.##.##..",
  ".##########.",
  ".#.######.#.",
  ".#.#....#.#.",
  "...##..##...",
  "............",
  "............",
];

/** The cells of a sigil being drawn, by row and then column. */
type Grid = boolean[][];

/** Where the middle of the grid is, between its two middle columns and its two middle rows. */
const MIDDLE = S / 2;

function blank(): Grid {
  return Array.from({ length: S }, () => Array.from({ length: S }, () => false));
}

const isOn = (grid: Grid, x: number, y: number): boolean => grid[y]?.[x] === true;

/** Set the cell at `x` and `y` and the one mirroring it, left to right. Cells off the grid are no cells. */
function put(grid: Grid, x: number, y: number, on = true): void {
  const row = grid[y];
  if (row === undefined || x < 0 || x >= S) return;
  row[x] = on;
  row[S - 1 - x] = on;
}

/** Numbers to draw with, from a source that gives them from 0 up to 1. A number outside that is taken as the nearest one in it. */
interface Dice {
  between(low: number, high: number): number;
  /** A whole number from `low` to `high`, both included. */
  int(low: number, high: number): number;
  chance(odds: number): boolean;
  pick<T>(items: readonly [T, ...T[]]): T;
}

function diceOf(random: () => number): Dice {
  const next = (): number => {
    const number = random();
    return Number.isFinite(number) ? Math.min(Math.max(number, 0), 1 - Number.EPSILON) : 0;
  };
  const int = (low: number, high: number): number => low + Math.floor(next() * (high - low + 1));
  return {
    between: (low, high) => low + next() * (high - low),
    int,
    chance: (odds) => next() < odds,
    pick: (items) => items[int(0, items.length - 1)] ?? items[0],
  };
}

/** `base` to the power `exponent`, a whole number, by multiplying. */
function power(base: number, exponent: number): number {
  let result = 1;
  for (let times = 0; times < exponent; times += 1) result *= base;
  return result;
}

/**
 * A blob on the middle line: an ellipse when `round` is 2, a box with round
 * corners when it is more, and wider at the bottom than the top when `taper` is
 * above 0.
 */
interface Blob {
  y: number;
  width: number;
  height: number;
  round: number;
  taper: number;
}

/** Turn on every cell whose middle is inside `blob`. */
function fill(grid: Grid, blob: Blob): void {
  for (let y = 0; y < S; y += 1) {
    const down = (y + 0.5 - blob.y) / blob.height;
    const width = blob.width * (1 + blob.taper * down);
    for (let x = 0; x < MIDDLE; x += 1) {
      if (power(Math.abs(x + 0.5 - MIDDLE) / width, blob.round) + power(Math.abs(down), blob.round) <= 1) put(grid, x, y);
    }
  }
}

/** The rows with a cell on in the left half, top first. */
function rowsOn(grid: Grid): number[] {
  return grid.flatMap((row, y) => (row.slice(0, MIDDLE).includes(true) ? [y] : []));
}

/** The leftmost cell on in row `y`, or undefined. */
function leftmost(grid: Grid, y: number): number | undefined {
  const x = grid[y]?.indexOf(true) ?? -1;
  return x === -1 ? undefined : x;
}

/** A creature: a body, maybe a head, a face, and some of legs, arms, feelers and a pattern. */
function creature(dice: Dice): Grid {
  const grid = blank();
  const body: Blob = {
    y: dice.between(6, 7.5),
    width: dice.between(2.5, 5.2),
    height: dice.between(2, 3.6),
    round: dice.int(2, 4),
    taper: dice.chance(0.4) ? dice.between(-0.45, 0.45) : 0,
  };
  fill(grid, body);
  const brow = Math.floor(body.y - body.height * 0.4);
  let eyeRows = [brow, brow + 1];
  if (dice.chance(0.6)) {
    const height = dice.between(1.4, 2.3);
    const head: Blob = {
      y: Math.max(body.y - body.height - height * 0.35, height + 0.3),
      width: dice.between(1.6, Math.max(1.7, Math.min(3.4, body.width))),
      height,
      round: dice.int(2, 3),
      taper: 0,
    };
    fill(grid, head);
    const middle = Math.floor(head.y);
    eyeRows = [middle, middle + 1, middle - 1];
  }
  const rows = rowsOn(grid);
  face(grid, dice, [...eyeRows, ...rows.slice(1, Math.ceil(rows.length / 2))]);
  const bottom = rows.at(-1) ?? MIDDLE;
  if (dice.chance(0.75)) legs(grid, dice, bottom);
  else if (dice.chance(0.5)) skirt(grid, dice, bottom);
  if (dice.chance(0.45)) arms(grid, dice);
  if (dice.chance(0.45)) feelers(grid, dice);
  if (dice.chance(0.2)) pattern(grid, dice);
  return grid;
}

/**
 * Two eyes, as holes with the face around them, in the first of `rows` that has
 * room for them, and now and then a mouth under them. Now and then the eyes
 * meet in the middle as one wide eye, and now and then they are tall.
 */
function face(grid: Grid, dice: Dice, rows: readonly number[]): void {
  const columns = dice.chance(0.2) ? [MIDDLE - 1] : dice.chance(0.5) ? [MIDDLE - 2, MIDDLE - 3] : [MIDDLE - 3, MIDDLE - 2];
  const room = (x: number, y: number): boolean =>
    isOn(grid, x, y) && isOn(grid, x - 1, y) && isOn(grid, x, y - 1) && isOn(grid, x, y + 1);
  for (const y of rows) {
    const x = columns.find((each) => room(each, y));
    if (x === undefined) continue;
    put(grid, x, y, false);
    const tall = dice.chance(0.3) && isOn(grid, x - 1, y + 1) && isOn(grid, x, y + 2);
    if (tall) put(grid, x, y + 1, false);
    const mouth = y + (tall ? 3 : 2);
    if (x < MIDDLE - 1 && dice.chance(0.35) && room(MIDDLE - 1, mouth) && room(MIDDLE - 2, mouth)) {
      put(grid, MIDDLE - 1, mouth, false);
      if (dice.chance(0.5)) put(grid, MIDDLE - 2, mouth, false);
    }
    return;
  }
}

/** Legs from under the body, two columns apart, straight or splayed, some with feet. */
function legs(grid: Grid, dice: Dice, bottom: number): void {
  const length = Math.min(dice.int(2, 4), S - 1 - bottom);
  const splay = dice.chance(0.5);
  let x = Math.min((leftmost(grid, bottom) ?? MIDDLE - 1) + dice.int(0, 1), MIDDLE - 1);
  for (let count = dice.int(1, 3); count > 0 && x < MIDDLE; count -= 1, x += 2) {
    let at = x;
    for (let step = 1; step <= length; step += 1) {
      if (splay && step > 1 && dice.chance(0.6)) at -= 1;
      put(grid, at, bottom + step);
    }
    if (dice.chance(0.35)) put(grid, at - 1, bottom + length);
  }
}

/** The body's lowest row cut into a fringe, as a ghost's is. */
function skirt(grid: Grid, dice: Dice, bottom: number): void {
  const phase = dice.int(0, 1);
  for (let x = 0; x < MIDDLE; x += 1) if ((x + phase) % 2 === 0) put(grid, x, bottom, false);
}

/** Arms from the sides of the body, some ending in a claw. */
function arms(grid: Grid, dice: Dice): void {
  const rows = rowsOn(grid);
  const y = rows[Math.floor(rows.length / 2) + dice.int(-1, 1)];
  if (y === undefined) return;
  let x = (leftmost(grid, y) ?? 1) - 1;
  const reach = dice.int(1, 3);
  for (let step = 0; step < reach && x > 0; step += 1) put(grid, x - step, y);
  x -= reach - 1;
  const claw = dice.int(0, 2);
  if (claw >= 1) put(grid, Math.max(x, 0), y - 1);
  if (claw === 2) put(grid, Math.max(x, 0), y - 2);
}

/** Feelers or horns from the top, going up and out. */
function feelers(grid: Grid, dice: Dice): void {
  const top = rowsOn(grid)[0];
  if (top === undefined || top === 0) return;
  let x = (leftmost(grid, top) ?? MIDDLE - 1) + dice.int(0, 1);
  const length = Math.min(dice.int(1, 3), top);
  for (let step = 1; step <= length; step += 1) {
    if (step > 1 || dice.chance(0.5)) x -= dice.chance(0.6) ? 1 : 0;
    put(grid, x, top - step);
  }
  if (dice.chance(0.3)) put(grid, x - 1, top - length);
}

/** Spots or a stripe across the body, where the body is around them. */
function pattern(grid: Grid, dice: Dice): void {
  const rows = rowsOn(grid);
  const y = rows[Math.floor(rows.length / 2) + 1];
  if (y === undefined) return;
  const phase = dice.int(0, 1);
  for (let x = 1; x < MIDDLE; x += 1) {
    const around = isOn(grid, x - 1, y) && isOn(grid, x + 1, y) && isOn(grid, x, y - 1) && isOn(grid, x, y + 1);
    if (around && (x + phase) % 2 === 0) put(grid, x, y, false);
  }
}

/** Whether a cell whose middle is `dx` and `dy` from the middle of the grid is inside a shape of `size`. */
type Shape = (dx: number, dy: number, size: number) => boolean;

/** How far a cell's middle is from the middle of the grid, squared. */
const farSquared = (dx: number, dy: number): number => dx * dx + dy * dy;

/** The shapes an emblem is made of, each the same left to right and upside down, around the middle. */
const SHAPES: readonly [Shape, ...Shape[]] = [
  /* ring */ (dx, dy, size) => farSquared(dx, dy) >= (size - 0.55) * (size - 0.55) && farSquared(dx, dy) <= (size + 0.55) * (size + 0.55),
  /* disc */ (dx, dy, size) => farSquared(dx, dy) <= size * 0.55 * (size * 0.55),
  /* diamond */ (dx, dy, size) => Math.abs(Math.abs(dx) + Math.abs(dy) - size - 1) <= 0.5,
  /* frame */ (dx, dy, size) => Math.abs(Math.max(Math.abs(dx), Math.abs(dy)) - size) <= 0.5,
  /* cross */ (dx, dy, size) => (Math.abs(dx) <= 1 && Math.abs(dy) <= size + 0.5) || (Math.abs(dy) <= 1 && Math.abs(dx) <= size + 0.5),
  /* saltire */ (dx, dy, size) => Math.abs(Math.abs(dx) - Math.abs(dy)) <= 0.5 && Math.max(Math.abs(dx), Math.abs(dy)) <= size + 0.5,
  /* studs */ (dx, dy, size) => Math.abs(Math.abs(dx) - size) <= 0.5 && Math.abs(Math.abs(dy) - size) <= 0.5,
];

/** An emblem: two or three shapes around the middle, laid over each other or cut out of each other. */
function emblem(dice: Dice): Grid {
  const grid = blank();
  for (let shape = 0, count = dice.int(2, 3); shape < count; shape += 1) {
    const inside = dice.pick(SHAPES);
    const size = dice.between(1.5, 5);
    const cut = shape > 0 && dice.chance(0.25);
    for (let y = 0; y < S; y += 1) {
      for (let x = 0; x < MIDDLE; x += 1) {
        if (inside(x + 0.5 - MIDDLE, y + 0.5 - MIDDLE, size)) put(grid, x, y, cut ? !isOn(grid, x, y) : true);
      }
    }
  }
  return grid;
}

/** Whether a drawing makes a sigil: neither nearly empty nor nearly full, wide and tall enough, and mostly one piece. */
function fits(grid: Grid): boolean {
  const on = grid.flat().filter(Boolean).length;
  if (on < FEWEST || on > MOST) return false;
  const rows = rowsOn(grid);
  const wide = Math.min(...rows.map((y) => leftmost(grid, y) ?? MIDDLE));
  if (rows.length < 6 || wide > MIDDLE - 3) return false;
  return largestPiece(grid) >= on * 0.8;
}

/** The eight cells around a cell. */
const AROUND = [-1, 0, 1].flatMap((dy) => [-1, 0, 1].filter((dx) => dx !== 0 || dy !== 0).map((dx) => [dx, dy] as const));

/** How many cells the largest piece has, counting cells that touch at a corner as one piece. */
function largestPiece(grid: Grid): number {
  const seen = new Set<number>();
  let largest = 0;
  for (let first = 0; first < S * S; first += 1) {
    if (seen.has(first) || !isOn(grid, first % S, Math.floor(first / S))) continue;
    seen.add(first);
    const piece = [first];
    for (let index = 0; index < piece.length; index += 1) {
      const cell = piece[index] ?? first;
      const x = cell % S;
      const y = Math.floor(cell / S);
      for (const [dx, dy] of AROUND) {
        const next = (y + dy) * S + x + dx;
        if (isOn(grid, x + dx, y + dy) && !seen.has(next)) {
          seen.add(next);
          piece.push(next);
        }
      }
    }
    largest = Math.max(largest, piece.length);
  }
  return largest;
}

/** The drawing moved up or down so that it sits in the middle, with as much empty above it as below, give or take a row. */
function centered(grid: Grid): Grid {
  const rows = rowsOn(grid);
  const top = rows[0] ?? 0;
  const below = S - 1 - (rows.at(-1) ?? S - 1);
  const shift = Math.trunc((below - top) / 2);
  if (shift === 0) return grid;
  return Array.from({ length: S }, (_, y) => grid[y - shift]?.slice() ?? Array.from({ length: S }, () => false));
}

function linesOf(grid: Grid): string[] {
  return grid.map((row) => row.map((on) => (on ? ON : OFF)).join(""));
}

/** Numbers from 0 up to 1 worked out from `seed`, the same for the same seed anywhere: a string hash, then mulberry32. */
function randomFrom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
