import {
  type EditorTheme,
  getTerminalColorMode,
  type LoaderIndicatorOptions,
  type MarkdownTheme,
  parseColor,
  type SelectListTheme,
  styleText,
  type TextStyle,
} from "@earendil-works/pi-tui";

/** The palette of Shrimpy's theme, as the old terminal wore it. */
const PALETTE = {
  shrimp: "#F88379",
  peach: "#ffa07a",
  seafoam: "#72d5a3",
  sky: "#7ec8e3",
  sand: "#f5deb3",
  red: "#e85d5d",
  gray: "#8a8a8a",
  dimGray: "#6a6a6a",
  darkGray: "#4a4647",
};

type Paint = (text: string) => string;

/** How the console looks: style functions for each thing it draws, over the colors the terminal can show. */
export interface Theme {
  title: Paint;
  /** Secondary text, such as times and key hints. */
  dim: Paint;
  warn: Paint;
  bar: Paint;
  bold: Paint;
  /** A name: the person's own, an agent's, or another person's. */
  me: Paint;
  agent: Paint;
  other: Paint;
  /** Thinking, as the agent mutters it. */
  thinking: Paint;
  /** A tool's status, by how it stands. */
  tone: Record<"good" | "bad" | "busy" | "idle", Paint>;
  /** The busy mark the agent working shows, one frame after another. */
  working: LoaderIndicatorOptions;
  /** The spinner's color and the message's. */
  spinner: Paint;
  markdown: MarkdownTheme;
  editor: EditorTheme;
  /** The editor's border while the agent is working. */
  editorBusy: Paint;
  select: SelectListTheme;
}

export function createTheme(): Theme {
  const mode = getTerminalColorMode();
  const paint =
    (style: TextStyle): Paint =>
    (text) =>
      styleText(text, style, mode);
  const color = (hex: string): TextStyle => ({ fg: parseColor(hex) });
  const dim = paint(color(PALETTE.gray));
  const bar = paint(color(PALETTE.darkGray));
  const accent = paint(color(PALETTE.shrimp));
  return {
    title: paint({ ...color(PALETTE.shrimp), bold: true }),
    dim,
    warn: paint(color(PALETTE.sand)),
    bar,
    bold: paint({ bold: true }),
    me: paint({ ...color(PALETTE.sky), bold: true }),
    agent: paint({ ...color(PALETTE.shrimp), bold: true }),
    other: paint({ ...color(PALETTE.seafoam), bold: true }),
    thinking: paint({ ...color(PALETTE.gray), italic: true }),
    tone: {
      good: paint(color(PALETTE.seafoam)),
      bad: paint(color(PALETTE.red)),
      busy: paint(color(PALETTE.sand)),
      idle: dim,
    },
    working: { frames: ["🦐  ", " 🦐 ", "  🦐", " 🦐 "], intervalMs: 180 },
    spinner: accent,
    markdown: {
      heading: paint({ ...color(PALETTE.shrimp), bold: true }),
      link: paint(color(PALETTE.sky)),
      linkUrl: paint(color(PALETTE.dimGray)),
      code: paint(color(PALETTE.peach)),
      codeBlock: paint(color(PALETTE.seafoam)),
      codeBlockBorder: bar,
      quote: paint({ ...color(PALETTE.gray), italic: true }),
      quoteBorder: paint(color(PALETTE.peach)),
      hr: bar,
      listBullet: accent,
      bold: paint({ bold: true }),
      italic: paint({ italic: true }),
      strikethrough: paint({ strikethrough: true }),
      underline: paint({ underline: true }),
    },
    editor: {
      borderColor: paint(color(PALETTE.dimGray)),
      selectList: selectTheme(paint, dim),
    },
    editorBusy: accent,
    select: selectTheme(paint, dim),
  };
}

function selectTheme(paint: (style: TextStyle) => Paint, dim: Paint): SelectListTheme {
  const selected = paint({ fg: parseColor(PALETTE.shrimp) });
  return {
    selectedPrefix: selected,
    selectedText: selected,
    description: dim,
    scrollInfo: dim,
    noMatch: dim,
  };
}
