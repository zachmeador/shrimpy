const SHRIMP_HEX = "#F88379";

const ESC = "\x1b[";
const RESET = `${ESC}0m`;

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const n = parseInt(value, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function fgAnsi(hex: string): string {
  const [r, g, b] = hexToRgb(hex);
  return `${ESC}38;2;${r};${g};${b}m`;
}

const SHRIMP_FG = fgAnsi(SHRIMP_HEX);
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;

export interface StyleEnv {
  isTTY: boolean;
  noColor: boolean;
  forceColor: boolean;
}

export function readStyleEnv(env: NodeJS.ProcessEnv = process.env): StyleEnv {
  return {
    isTTY: Boolean(process.stdout.isTTY),
    noColor: Object.prototype.hasOwnProperty.call(env, "NO_COLOR"),
    forceColor: env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "0" && env.FORCE_COLOR !== "",
  };
}

export function colorEnabled(env: StyleEnv = readStyleEnv()): boolean {
  if (env.noColor) return false;
  if (env.forceColor) return true;
  return env.isTTY;
}

function paint(open: string, text: string): string {
  return colorEnabled() ? `${open}${text}${RESET}` : text;
}

export const SHRIMP_COLOR_HEX = SHRIMP_HEX;

export function shrimp(text: string): string {
  return paint(SHRIMP_FG, text);
}

export function bold(text: string): string {
  return paint(BOLD, text);
}

export function dim(text: string): string {
  return paint(DIM, text);
}

export function brand(text = "shrimpy"): string {
  return paint(`${BOLD}${SHRIMP_FG}`, text);
}

export function label(text: string): string {
  return paint(DIM, text);
}

export function heading(text: string): string {
  return paint(`${BOLD}${SHRIMP_FG}`, text);
}

export function accent(text: string): string {
  return paint(SHRIMP_FG, text);
}

export function paintHex(hex: string, text: string): string {
  return `${fgAnsi(hex)}${text}${RESET}`;
}
