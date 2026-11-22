import { type Component, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import { role, type Run } from "./paint.ts";
import { hint, hintRuns, spread } from "./rows.ts";
import type { Frame } from "./screen.ts";
import { ALL_KEYS, CLOSE_KEYS, type Hint, KEYS_TITLE, QUIT_AGAIN } from "./words.ts";

/**
 * The last line: the keys that move you from where the keys are, or, while
 * the list of keys is open, how to close it, or, after one Ctrl+C, that another
 * quits.
 */
export class KeysLine implements Component {
  readonly #frame: Frame;
  readonly #hints: () => readonly Hint[] | "quit-again";

  constructor(frame: Frame, hints: () => readonly Hint[] | "quit-again") {
    this.#frame = frame;
    this.#hints = hints;
  }

  render(width: number): string[] {
    const { paint } = this.#frame;
    const hints = this.#hints();
    const runs: Run[] = hints === "quit-again" ? [[QUIT_AGAIN, role("caution")]] : hintRuns(hints);
    return [paint.lay(spread(paint, [[" ", "ink"], ...runs], [], width), width, "ground")];
  }

  invalidate(): void {}
}

/** How wide the list of keys is, at most. */
export const KEYS_WIDTH = 66;

/**
 * The list of every key, in a raised box with its corners stepped: its title,
 * how to close it, and each group of keys with what each does. A click on it
 * closes it.
 */
export class KeysList implements Component {
  readonly #frame: Frame;
  readonly #close: () => void;

  constructor(frame: Frame, close: () => void) {
    this.#frame = frame;
    this.#close = close;
  }

  render(width: number): string[] {
    const { paint } = this.#frame;
    const body: string[] = ["", spread(paint, [["  ", "ink"], [KEYS_TITLE, { tone: "ink", bold: true }]], hint(CLOSE_KEYS), width - 1), ""];
    const keyWidth = Math.max(...ALL_KEYS.flatMap(([, keys]) => keys.map(([key]) => visibleWidth(key)))) + 3;
    for (const [group, keys] of ALL_KEYS) {
      body.push(spread(paint, [["  ", "ink"], [group, "ink3"]], [], width));
      for (const [key, does] of keys) {
        body.push(spread(paint, [["    ", "ink"], [key.padEnd(keyWidth), { tone: "ink", bold: true }], [does, "ink2"]], [], width));
      }
    }
    body.push("");
    // The corners are cut by half a cell, as the web client's are by two pixels, and what is under the box shows there.
    const lines = body.map((line) => paint.lay(line, width, "raise"));
    const blank = paint.lay("", width - 2, "raise");
    const step = (glyph: string): string => paint.text(glyph, { tone: "raise", on: "pane" });
    lines[0] = `${step("▄")}${blank}${step("▄")}`;
    lines[lines.length - 1] = `${step("▀")}${blank}${step("▀")}`;
    return lines;
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type !== "click") return undefined;
    this.#close();
    return { handled: true };
  }

  invalidate(): void {}
}
