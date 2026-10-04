import {
  FooterComponent,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";
import {
  truncateToWidth,
  visibleWidth,
  type Component,
  type TUI,
} from "@earendil-works/pi-tui";

const FRAME_INTERVAL_MS = 180;
const SHRIMP_BLOCK_WIDTH = 4;
const SHRIMP_BLOCK_GAP = 1;
const SHRIMP_WRAP_MARGIN = 1;
const SHRIMP_SUFFIX_WIDTH = SHRIMP_BLOCK_GAP + SHRIMP_BLOCK_WIDTH;
const SHRIMP_SUFFIX_RESERVE = SHRIMP_SUFFIX_WIDTH + SHRIMP_WRAP_MARGIN;
const SHRIMP_BLOCK_EMPTY = " ".repeat(SHRIMP_BLOCK_WIDTH);
const SHRIMP_FRAMES: Array<[string, string]> = [
  ["🦐  ", SHRIMP_BLOCK_EMPTY],
  ["  🦐", SHRIMP_BLOCK_EMPTY],
  [SHRIMP_BLOCK_EMPTY, "  🦐"],
  [SHRIMP_BLOCK_EMPTY, "🦐  "],
];
const IDLE_FRAME: [string, string] = [SHRIMP_BLOCK_EMPTY, "🦐  "];

type FooterData = ConstructorParameters<typeof FooterComponent>[1];

export function createShrimpyFooterExtensionFactory(
  getSession: () => AgentSession,
): ExtensionFactory {
  return (pi) => {
    pi.on("session_start", (_event, ctx) => {
      if (ctx.mode !== "tui") return;
      ctx.ui.setFooter((tui, _theme, footerData) =>
        new ShrimpyFooter(getSession, footerData, tui));
    });
  };
}

class ShrimpyFooter implements Component {
  private readonly footer: FooterComponent;
  private readonly interval: ReturnType<typeof setInterval>;
  private frameIndex = 0;
  private session: AgentSession;
  private unsubscribe: () => void;
  private compacting = false;
  private retrying = false;

  constructor(
    private readonly getSession: () => AgentSession,
    footerData: FooterData,
    private readonly tui: TUI,
  ) {
    this.session = getSession();
    this.footer = new FooterComponent(this.session, footerData);
    this.unsubscribe = this.session.subscribe((event) => this.handleSessionEvent(event));
    this.interval = setInterval(() => {
      if (!this.isBusy()) return;
      this.frameIndex = (this.frameIndex + 1) % SHRIMP_FRAMES.length;
      this.tui.requestRender();
    }, FRAME_INTERVAL_MS);
    this.interval.unref();
  }

  render(width: number): string[] {
    this.bindSession(this.getSession());
    this.footer.setSession(this.session);
    this.footer.setAutoCompactEnabled(this.session.autoCompactionEnabled);
    return renderShrimpyActivityFooter(
      this.footer.render(shrimpyFooterContentWidth(width)),
      width,
      this.isBusy(),
      this.frameIndex,
    );
  }

  invalidate(): void {
    this.footer.invalidate();
  }

  dispose(): void {
    clearInterval(this.interval);
    this.unsubscribe();
    this.footer.dispose();
  }

  private bindSession(session: AgentSession): void {
    if (session === this.session) return;
    this.unsubscribe();
    this.session = session;
    this.compacting = false;
    this.retrying = false;
    this.unsubscribe = session.subscribe((event) => this.handleSessionEvent(event));
  }

  private handleSessionEvent(event: AgentSessionEvent): void {
    if (event.type === "compaction_start") this.compacting = true;
    if (event.type === "compaction_end") this.compacting = false;
    if (event.type === "auto_retry_start") this.retrying = true;
    if (event.type === "auto_retry_end") this.retrying = false;
    if (
      event.type === "compaction_start"
      || event.type === "compaction_end"
      || event.type === "auto_retry_start"
      || event.type === "auto_retry_end"
    ) {
      this.tui.requestRender();
    }
  }

  private isBusy(): boolean {
    return this.session.isStreaming || this.compacting || this.retrying;
  }
}

export function renderShrimpyActivityFooter(
  lines: string[],
  width: number,
  busy: boolean,
  frameIndex: number,
): string[] {
  if (!canRenderShrimpSuffix(width)) {
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  const block = busy
    ? SHRIMP_FRAMES[frameIndex % SHRIMP_FRAMES.length] ?? IDLE_FRAME
    : IDLE_FRAME;
  const contentWidth = shrimpyFooterContentWidth(width);
  const output = [...lines];
  while (output.length < 2) output.push("");

  const blockStartIndex = output.length - 2;
  return output.map((line, index) => {
    const blockIndex = index - blockStartIndex;
    const truncated = truncateToWidth(line, contentWidth, "");
    if (blockIndex < 0) return truncated;

    const shrimpLine = block[blockIndex] ?? "";
    const suffix = `${" ".repeat(SHRIMP_BLOCK_GAP)}${padVisibleWidth(
      shrimpLine,
      SHRIMP_BLOCK_WIDTH,
    )}`;
    return padVisibleWidth(truncated, contentWidth) + suffix;
  });
}

function padVisibleWidth(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "");
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function canRenderShrimpSuffix(width: number): boolean {
  return width > SHRIMP_SUFFIX_RESERVE;
}

function shrimpyFooterContentWidth(width: number): number {
  return canRenderShrimpSuffix(width)
    ? Math.max(1, width - SHRIMP_SUFFIX_RESERVE)
    : width;
}
