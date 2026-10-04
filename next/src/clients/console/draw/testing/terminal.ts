import { stripTerminalSequences, type Terminal } from "@earendil-works/pi-tui";

/** A terminal that is a size, takes what is written to it, and hears what a test types. */
export class FakeTerminal implements Terminal {
  columns: number;
  rows: number;
  kittyProtocolActive = false;
  /** Everything written to it, in order. */
  readonly written: string[] = [];
  started = false;
  stopped = false;
  #onInput: ((data: string) => void) | undefined;

  constructor(columns = 80, rows = 24) {
    this.columns = columns;
    this.rows = rows;
  }

  start(onInput: (data: string) => void): void {
    this.#onInput = onInput;
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
  drainInput(): Promise<void> {
    return Promise.resolve();
  }
  write(data: string): void {
    this.written.push(data);
  }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}

  /** Type as a person would: keys arrive as the terminal sends them. */
  type(data: string): void {
    this.#onInput?.(data);
  }
  /** Everything written to it so far, as one string. */
  output(): string {
    return this.written.join("");
  }
}

/** Lines of a drawing as a person reads them: without styles, and without the spaces that pad them. */
export function visible(lines: string[]): string[] {
  return lines.map((line) => stripTerminalSequences(line).trimEnd());
}
