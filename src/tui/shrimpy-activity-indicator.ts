import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import {
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

interface InteractiveModeActivityInternals {
  footer: Component & { dispose?(): void };
  session: AgentSession;
  ui: {
    requestRender(): void;
  };
  loadingAnimation?: unknown;
  autoCompactionLoader?: unknown;
  retryLoader?: unknown;
}

const FRAME_INTERVAL_MS = 180;
const SHRIMP_BLOCK_WIDTH = 4;
const SHRIMP_BLOCK_GAP = 1;
const SHRIMP_BLOCK_EMPTY = " ".repeat(SHRIMP_BLOCK_WIDTH);
const SHRIMP_FRAMES: Array<[string, string]> = [
  ["🦐  ", SHRIMP_BLOCK_EMPTY],
  ["  🦐", SHRIMP_BLOCK_EMPTY],
  [SHRIMP_BLOCK_EMPTY, "  🦐"],
  [SHRIMP_BLOCK_EMPTY, "🦐  "],
];
const IDLE_FRAME: [string, string] = [SHRIMP_BLOCK_EMPTY, "🦐  "];

export function installShrimpyActivityIndicator(interactive: unknown): void {
  const mode = interactive as InteractiveModeActivityInternals;
  const footer = mode.footer;
  const originalRender = footer.render.bind(footer);
  const originalDispose = footer.dispose?.bind(footer);
  let frameIndex = 0;

  const interval = setInterval(() => {
    if (!isBusy(mode)) return;
    frameIndex = (frameIndex + 1) % SHRIMP_FRAMES.length;
    mode.ui.requestRender();
  }, FRAME_INTERVAL_MS);
  interval.unref?.();

  footer.render = (width: number) => {
    const busy = isBusy(mode);
    const contentWidth = Math.max(
      1,
      width - SHRIMP_BLOCK_WIDTH - SHRIMP_BLOCK_GAP,
    );
    return renderShrimpyActivityFooter(
      originalRender(contentWidth),
      width,
      busy,
      frameIndex,
    );
  };

  footer.dispose = () => {
    clearInterval(interval);
    originalDispose?.();
  };
}

export function renderShrimpyActivityFooter(
  lines: string[],
  width: number,
  busy: boolean,
  frameIndex: number,
): string[] {
  const block = busy
    ? SHRIMP_FRAMES[frameIndex % SHRIMP_FRAMES.length] ?? SHRIMP_FRAMES[0]
    : IDLE_FRAME;
  const prefixWidth = SHRIMP_BLOCK_WIDTH + SHRIMP_BLOCK_GAP;
  const contentWidth = Math.max(1, width - prefixWidth);
  const output = [...lines];

  while (output.length < 2) {
    output.push("");
  }

  const blockStartIndex = output.length - 2;
  return output.map((line, index) => {
    const blockIndex = index - blockStartIndex;
    const prefix = blockIndex >= 0
      ? `${padVisibleWidth(block[blockIndex] ?? "", SHRIMP_BLOCK_WIDTH)} `
      : " ".repeat(prefixWidth);
    return padVisibleWidth(prefix + truncateToWidth(line, contentWidth, ""), width);
  });
}

function padVisibleWidth(text: string, width: number): string {
  const truncated = truncateToWidth(text, width, "");
  return truncated + " ".repeat(Math.max(0, width - visibleWidth(truncated)));
}

function isBusy(mode: InteractiveModeActivityInternals): boolean {
  return Boolean(
    mode.session.isStreaming
      || mode.loadingAnimation
      || mode.autoCompactionLoader
      || mode.retryLoader,
  );
}
