/**
 * A terminal that is a size, takes what is written to it, and hears what a test
 * types. It has the shape a terminal user interface draws on, so the console's
 * drawing takes it, and the console opened from the command line too.
 */
export class FakeTerminal {
  columns: number;
  rows: number;
  kittyProtocolActive = false;
  /** Everything written to it, in order. */
  readonly written: string[] = [];
  started = false;
  stopped = false;
  /** How many times the screen was drawn again with the cursor hidden, whether or not anything changed. */
  hides = 0;
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
  hideCursor(): void {
    this.hides += 1;
  }
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
  setProgramStatus(): void {}

  /** Type as a person would: keys arrive as the terminal sends them. */
  type(data: string): void {
    this.#onInput?.(data);
  }
  /** Everything written to it so far, as one string. */
  output(): string {
    return this.written.join("");
  }
  /** Everything written so far, without the styles and cursor moves, as the text that was drawn. */
  text(): string {
    return this.output().replace(/\u001b\[[0-9;:?]*[A-Za-z]|\u001b\][^\u0007]*\u0007|\u001b_[^\u0007]*\u0007/g, "");
  }
}
