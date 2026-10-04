/**
 * A terminal that is a size, takes what is written to it, and hears what a test
 * types, for opening the console from the command line without a person. It is
 * written to the shape the console draws on, since only the console knows the
 * library that names it.
 */
export class FakeTerminal {
  columns: number;
  rows: number;
  kittyProtocolActive = false;
  started = false;
  stopped = false;
  readonly #written: string[] = [];
  #onInput: ((data: string) => void) | undefined;

  constructor(columns = 100, rows = 40) {
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
    this.#written.push(data);
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

  /** Everything written so far, without the styles and cursor moves, as the text that was drawn. */
  text(): string {
    return this.#written
      .join("")
      .replace(/\u001b\[[0-9;:?]*[A-Za-z]|\u001b\][^\u0007]*\u0007|\u001b_[^\u0007]*\u0007/g, "");
  }
}
