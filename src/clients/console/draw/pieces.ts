import { Editor, getKeybindings, truncateToWidth, type TuiMouseEvent, type TuiMouseEventResult, visibleWidth } from "@earendil-works/pi-tui";
import type { FileToSend } from "../../../contracts/chat/index.ts";
import { pictureOf } from "../../../lib/pictures/index.ts";
import { oneLine } from "../../../lib/plain/index.ts";
import type { Paint } from "./paint.ts";
import { FILE_MARK, PICTURE_MARK } from "./rows.ts";

const FIRST = 0xe000;
const LAST = 0xf8ff;
const PIECE = /[\ue000-\uf8ff]/;
const PIECES = /[\ue000-\uf8ff]/g;
const RUNS = /([\ue000-\uf8ff])\1*/g;
const RUNS_WITH_SPACE = /([\ue000-\uf8ff])\1* ?/g;
const LEFT = "\u001b[D";
const WIDEST = 32;

interface Piece {
  file: FileToSend;
  label: string;
}

export class PieceEditor extends Editor {
  readonly #pieces = new Map<string, Piece>();
  #next = FIRST;

  attach(file: FileToSend): void {
    const char = this.#free();
    const mark = pictureOf(file.bytes) === undefined ? FILE_MARK : PICTURE_MARK;
    const label = ` ${mark} ${truncateToWidth(oneLine(file.name), WIDEST - 5, "…")} `;
    this.#pieces.set(char, { file, label });
    const { line, col } = this.getCursor();
    const before = (this.getLines()[line] ?? "").charAt(col - 1);
    this.insertTextAtCursor(`${before === "" || /\s/.test(before) ? "" : " "}${char.repeat(visibleWidth(label))} `);
  }

  waiting(): { size: number }[] {
    return this.filesIn(this.getText()).map((file) => ({ size: file.bytes.byteLength }));
  }

  filesIn(text: string): FileToSend[] {
    return [...new Set(text.match(PIECES))].flatMap((char) => this.#pieces.get(char)?.file ?? []);
  }

  wordsOf(text: string): string {
    return text.replace(RUNS_WITH_SPACE, "").trim();
  }

  sent(text: string): void {
    for (const char of text.match(PIECES) ?? []) this.#pieces.delete(char);
  }

  drawn(line: string, paint: Paint, cursor: { start: string; end: string }): string {
    if (!PIECE.test(line)) return line;
    const at = line.indexOf(cursor.start);
    const under = at === -1 ? "" : line.charAt(at + cursor.start.length);
    const onPiece = PIECE.test(under) && line.startsWith(cursor.end, at + cursor.start.length + 1);
    const plain = onPiece ? `${line.slice(0, at)}${under}${line.slice(at + cursor.start.length + 1 + cursor.end.length)}` : line;
    return plain.replace(RUNS, (run: string, char: string, offset: number) => {
      const label = this.#pieces.get(char)?.label ?? " ";
      const cut = truncateToWidth(label.repeat(Math.ceil(run.length / visibleWidth(label))), run.length, "");
      const shown = paint.text(`${cut}${" ".repeat(Math.max(0, run.length - visibleWidth(cut)))}`, { tone: "ink", on: "raise" });
      return onPiece && offset === at ? `${cursor.start}${shown}${cursor.end}` : shown;
    });
  }

  override handleInput(data: string): void {
    const keys = getKeybindings();
    const back = keys.matches(data, "tui.editor.cursorLeft") || keys.matches(data, "tui.editor.deleteCharBackward");
    const ahead = keys.matches(data, "tui.editor.cursorRight") || keys.matches(data, "tui.editor.deleteCharForward");
    const times = back ? this.#run(-1) : ahead ? this.#run(1) : 0;
    for (let at = 1; at < times; at += 1) super.handleInput(data);
    super.handleInput(data);
    this.#settle();
  }

  override handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const result = super.handleMouse(event);
    this.#settle();
    return result;
  }

  #run(direction: -1 | 1): number {
    const { line, col } = this.getCursor();
    const text = this.getLines()[line] ?? "";
    const first = direction === -1 ? col - 1 : col;
    const char = text.charAt(first);
    if (!PIECE.test(char)) return 0;
    let count = 0;
    for (let at = first; text.charAt(at) === char; at += direction) count += 1;
    return count;
  }

  #settle(): void {
    const { line, col } = this.getCursor();
    const text = this.getLines()[line] ?? "";
    const char = text.charAt(col);
    if (!PIECE.test(char) || text.charAt(col - 1) !== char) return;
    for (let at = col - 1; text.charAt(at) === char; at -= 1) super.handleInput(LEFT);
  }

  #free(): string {
    for (let tried = FIRST; tried <= LAST; tried += 1) {
      const char = String.fromCharCode(this.#next);
      this.#next = this.#next === LAST ? FIRST : this.#next + 1;
      if (!this.#pieces.has(char)) return char;
    }
    return String.fromCharCode(this.#next);
  }
}
