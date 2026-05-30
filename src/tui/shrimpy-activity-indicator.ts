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
    const contentWidth = shrimpyFooterContentWidth(width);
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
  if (!canRenderShrimpSuffix(width)) {
    return lines.map((line) => truncateToWidth(line, width, ""));
  }

  const block = busy
    ? SHRIMP_FRAMES[frameIndex % SHRIMP_FRAMES.length] ?? SHRIMP_FRAMES[0]
    : IDLE_FRAME;
  const contentWidth = shrimpyFooterContentWidth(width);
  const output = [...lines];

  while (output.length < 2) {
    output.push("");
  }

  const blockStartIndex = output.length - 2;
  return output.map((line, index) => {
    const blockIndex = index - blockStartIndex;
    const truncated = truncateToWidth(line, contentWidth, "");
    if (blockIndex < 0) {
      return truncated;
    }

    const suffix = `${" ".repeat(SHRIMP_BLOCK_GAP)}${padVisibleWidth(
      block[blockIndex] ?? "",
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

function isBusy(mode: InteractiveModeActivityInternals): boolean {
  return Boolean(
    mode.session.isStreaming
      || mode.loadingAnimation
      || mode.autoCompactionLoader
      || mode.retryLoader,
  );
}
