/*
 * What an agent wrote in Markdown, as the elements the page draws it with:
 * marked reads it into tokens, and each token becomes one of a few elements,
 * with only the attributes they need, or text. Nothing it wrote is ever set as
 * HTML: HTML in it is text, a link goes only to a web address or an email
 * address, and an image is a link to it, so nothing is fetched by itself.
 */
import { lexer, type Token, type Tokens } from "marked";
import { type Mention, withMentions } from "../view/index.ts";

/** The elements Markdown is drawn with, and a span for each `@name` of an agent it mentions. */
type MdTag =
  | "span"
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "ul"
  | "ol"
  | "li"
  | "blockquote"
  | "pre"
  | "code"
  | "strong"
  | "em"
  | "del"
  | "a"
  | "br"
  | "hr"
  | "table"
  | "thead"
  | "tbody"
  | "tr"
  | "th"
  | "td";

/** One element, with a link's address, where a numbered list starts, or the pigment of the agent a mention names. */
interface MdElement {
  tag: MdTag;
  href?: string;
  start?: number;
  pigment?: string;
  children: Md[];
}

export type Md = string | MdElement;

interface MarkdownOptions {
  /** A line break in a paragraph breaks the line, as it does in a chat message. In a file it is a space. */
  breaks: boolean;
  /** The agents a message mentions, each marked where its text says `@name`. */
  mentions?: readonly Mention[];
}

/** `text`, Markdown, as elements. */
export function markdown(text: string, options: MarkdownOptions): Md[] {
  return blocks(lexer(text), options);
}

const el = (tag: MdTag, children: Md[], more: Omit<MdElement, "tag" | "children"> = {}): MdElement => ({ tag, children, ...more });

/** The schemes a link may go to: the web, and email. */
const SCHEMES = new Set(["http:", "https:", "mailto:"]);

/** `href` if it is a whole address on the web or an email address, and undefined for anything else, such as a script's. */
function safeHref(href: string): string | undefined {
  try {
    const url = new URL(href);
    return SCHEMES.has(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** `text` with the character references Markdown takes in it written as the characters they stand for. */
function decoded(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith("#")) {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

/** Text, with each line break a break where `options` says so, and each mention of an agent marked. */
function lines(text: string, options: MarkdownOptions): Md[] {
  const parts = !options.breaks || !text.includes("\n") ? [text] : text.split("\n").flatMap((line, at) => (at === 0 ? [line] : [el("br", []), line]));
  const { mentions } = options;
  if (mentions === undefined || mentions.length === 0) return parts;
  return parts.flatMap((part) =>
    typeof part === "string"
      ? withMentions(part, mentions).map((said) => (typeof said === "string" ? said : el("span", [said.mention], { pigment: said.look.pigment })))
      : [part],
  );
}

function blocks(tokens: readonly Token[], options: MarkdownOptions): Md[] {
  return tokens.flatMap((token) => block(token, options));
}

function block(token: Token, options: MarkdownOptions): Md[] {
  switch (token.type) {
    case "space":
    case "def":
      return [];
    case "paragraph":
      return [el("p", inline((token as Tokens.Paragraph).tokens, options))];
    case "heading": {
      const { depth, tokens } = token as Tokens.Heading;
      return [el(`h${String(Math.min(6, Math.max(1, depth)))}` as MdTag, inline(tokens, options))];
    }
    case "code":
      return [el("pre", [el("code", [(token as Tokens.Code).text])])];
    case "blockquote":
      return [el("blockquote", blocks((token as Tokens.Blockquote).tokens, options))];
    case "hr":
      return [el("hr", [])];
    case "list": {
      const list = token as Tokens.List;
      const items = list.items.map((item) => el("li", blocks(item.tokens, options)));
      return [list.ordered ? el("ol", items, typeof list.start === "number" && list.start !== 1 ? { start: list.start } : {}) : el("ul", items)];
    }
    case "table": {
      const table = token as Tokens.Table;
      const row = (cells: Tokens.TableCell[], tag: "th" | "td"): MdElement => el("tr", cells.map((cell) => el(tag, inline(cell.tokens, options))));
      return [el("table", [el("thead", [row(table.header, "th")]), el("tbody", table.rows.map((cells) => row(cells, "td")))])];
    }
    case "text": {
      const { tokens, text } = token as Tokens.Text;
      return tokens === undefined ? lines(decoded(text), options) : inline(tokens, options);
    }
    case "html":
      return [el("p", lines((token as Tokens.HTML).text.trimEnd(), options))];
    default:
      return inline([token], options);
  }
}

function inline(tokens: readonly Token[], options: MarkdownOptions): Md[] {
  return tokens.flatMap((token): Md[] => {
    switch (token.type) {
      case "text": {
        const { tokens: inner, text } = token as Tokens.Text;
        return inner === undefined ? lines(decoded(text), options) : inline(inner, options);
      }
      case "escape":
        return [(token as Tokens.Escape).text];
      case "strong":
        return [el("strong", inline((token as Tokens.Strong).tokens, options))];
      case "em":
        return [el("em", inline((token as Tokens.Em).tokens, options))];
      case "del":
        return [el("del", inline((token as Tokens.Del).tokens, options))];
      case "codespan":
        return [el("code", [(token as Tokens.Codespan).text])];
      case "br":
        return [el("br", [])];
      case "link": {
        const link = token as Tokens.Link;
        const children = inline(link.tokens, options);
        const href = safeHref(link.href);
        return href === undefined ? children : [el("a", children, { href })];
      }
      case "image": {
        const image = token as Tokens.Image;
        const href = safeHref(image.href);
        const words = image.text === "" ? image.href : image.text;
        return href === undefined ? [words] : [el("a", [words], { href })];
      }
      case "checkbox":
        return [(token as Tokens.Checkbox).checked ? "☑ " : "☐ "];
      case "html":
        return [(token as Tokens.Tag).text];
      default:
        return "tokens" in token && Array.isArray(token.tokens) ? inline(token.tokens as Token[], options) : [token.raw];
    }
  });
}
