import {
  DynamicBorder,
  getMarkdownTheme,
  type ExtensionCommandContext,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  Key,
  Markdown,
  matchesKey,
  Text,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";

const BODY_HEIGHT = 18;
const PAGE_SIZE = BODY_HEIGHT - 2;

export async function showReadOnlyPanel(
  ctx: ExtensionCommandContext,
  title: string,
  text: string,
  opts?: { markdown?: boolean },
): Promise<void> {
  if (ctx.mode !== "tui") {
    ctx.ui.notify(text, "info");
    return;
  }

  await ctx.ui.custom<void>((tui, theme, _keybindings, done) =>
    new ReadOnlyPanel(
      title,
      text,
      theme,
      tui,
      done,
      opts?.markdown ?? false,
    ));
}

class ReadOnlyPanel implements Component {
  private readonly border = new DynamicBorder();
  private readonly title: Text;
  private readonly body: Component;
  private offset = 0;
  private lastLineCount = 0;

  constructor(
    title: string,
    text: string,
    theme: Theme,
    private readonly tui: TUI,
    private readonly done: () => void,
    markdown: boolean,
  ) {
    this.title = new Text(theme.bold(theme.fg("accent", title)), 1, 0);
    this.body = markdown
      ? new Markdown(text, 1, 1, getMarkdownTheme())
      : new Text(text, 1, 0);
  }

  render(width: number): string[] {
    const bodyLines = this.body.render(width);
    this.lastLineCount = bodyLines.length;
    this.offset = clamp(this.offset, 0, this.maxOffset());
    const visible = bodyLines.slice(this.offset, this.offset + BODY_HEIGHT);
    const first = bodyLines.length === 0 ? 0 : this.offset + 1;
    const last = Math.min(this.offset + visible.length, bodyLines.length);
    const footer = new Text(
      `↑/↓ scroll  PgUp/PgDn page  ${first}-${last} of ${bodyLines.length}  Enter/Esc/q close`,
      1,
      0,
    );
    return [
      ...this.border.render(width),
      ...this.title.render(width),
      ...visible,
      ...footer.render(width),
      ...this.border.render(width),
    ];
  }

  handleInput(data: string): void {
    if (
      data === "q"
      || matchesKey(data, Key.enter)
      || matchesKey(data, Key.escape)
    ) {
      this.done();
      return;
    }

    const previous = this.offset;
    if (matchesKey(data, Key.up)) this.offset -= 1;
    if (matchesKey(data, Key.down)) this.offset += 1;
    if (matchesKey(data, Key.pageUp)) this.offset -= PAGE_SIZE;
    if (matchesKey(data, Key.pageDown)) this.offset += PAGE_SIZE;
    if (matchesKey(data, Key.home)) this.offset = 0;
    if (matchesKey(data, Key.end)) this.offset = this.maxOffset();
    this.offset = clamp(this.offset, 0, this.maxOffset());
    if (this.offset !== previous) this.tui.requestRender();
  }

  invalidate(): void {
    this.border.invalidate();
    this.title.invalidate();
    this.body.invalidate();
  }

  private maxOffset(): number {
    return Math.max(0, this.lastLineCount - BODY_HEIGHT);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
