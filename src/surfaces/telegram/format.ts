import MarkdownIt from "markdown-it";

export const TELEGRAM_TEXT_CHUNK_LIMIT = 4000;

export interface TelegramTextChunk {
  text: string;
  parseMode?: "HTML";
}
type TelegramHtmlTag = {
  name: string;
  openTag: string;
  closeTag: string;
};

type MarkdownToken = ReturnType<InstanceType<typeof MarkdownIt>["parse"]>[number];

const TELEGRAM_SELF_CLOSING_HTML_TAGS = new Set(["br"]);
const FILE_REF_EXTENSIONS = [
  "c",
  "conf",
  "cpp",
  "css",
  "env",
  "go",
  "h",
  "hpp",
  "html",
  "ini",
  "java",
  "js",
  "json",
  "jsx",
  "log",
  "md",
  "php",
  "py",
  "rb",
  "rs",
  "sh",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "yaml",
  "yml",
] as const;

const FILE_REF_EXTENSIONS_PATTERN = FILE_REF_EXTENSIONS.join("|");
const FILE_REF_PATTERN = new RegExp(
  `(^|[^a-zA-Z0-9_\\-/])([a-zA-Z0-9_.\\-./]+\\.(?:${FILE_REF_EXTENSIONS_PATTERN}))(?=$|[^a-zA-Z0-9_\\-/])`,
  "gi",
);
const AUTO_LINKED_ANCHOR_PATTERN = /<a\s+href="https?:\/\/([^"]+)"[^>]*>\1<\/a>/gi;
const HTML_TAG_PATTERN = /(<\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?>/gi;

const MARKDOWN = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  typographer: false,
});

MARKDOWN.disable("table");

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;");
}

function stripTrailingNewlines(text: string): string {
  return text.replace(/\n+$/g, "");
}

function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

function looksLikeFileReference(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
  const pattern = new RegExp(`^[a-zA-Z0-9_.\\-./]+\\.(?:${FILE_REF_EXTENSIONS_PATTERN})$`, "i");
  return pattern.test(trimmed);
}

function isAutoLinkedFileRef(href: string, label: string): boolean {
  const trimmedLabel = label.trim();
  if (!looksLikeFileReference(trimmedLabel)) return false;
  return href === `http://${trimmedLabel}` || href === `https://${trimmedLabel}`;
}

function renderTelegramInline(tokens: MarkdownToken[]): string {
  let html = "";

  for (const token of tokens) {
    switch (token.type) {
      case "text":
        html += escapeHtml(token.content);
        break;
      case "softbreak":
      case "hardbreak":
        html += "\n";
        break;
      case "code_inline":
        html += `<code>${escapeHtml(token.content)}</code>`;
        break;
      case "strong_open":
        html += "<b>";
        break;
      case "strong_close":
        html += "</b>";
        break;
      case "em_open":
        html += "<i>";
        break;
      case "em_close":
        html += "</i>";
        break;
      case "s_open":
        html += "<s>";
        break;
      case "s_close":
        html += "</s>";
        break;
      case "link_open": {
        const href = token.attrGet("href")?.trim();
        html += href ? `<a href="${escapeHtmlAttr(href)}">` : "";
        break;
      }
      case "link_close":
        html += "</a>";
        break;
      case "image": {
        const src = token.attrGet("src")?.trim();
        const alt = token.content.trim();
        if (src) {
          const label = alt || src;
          html += `<a href="${escapeHtmlAttr(src)}">${escapeHtml(label)}</a>`;
        } else if (alt) {
          html += escapeHtml(alt);
        }
        break;
      }
      default:
        if (token.children && token.children.length > 0) {
          html += renderTelegramInline(token.children);
        }
        break;
    }
  }

  return html;
}

function renderInlineContainer(
  tokens: MarkdownToken[],
  startIndex: number,
  stopType: string,
): { html: string; nextIndex: number } {
  let index = startIndex;
  let html = "";

  while (index < tokens.length) {
    const token = tokens[index];
    if (token.type === stopType) {
      return { html, nextIndex: index + 1 };
    }
    if (token.type === "inline" && token.children) {
      html += renderTelegramInline(token.children);
    } else if (token.children && token.children.length > 0) {
      html += renderTelegramInline(token.children);
    }
    index += 1;
  }

  return { html, nextIndex: index };
}

function renderBlocks(
  tokens: MarkdownToken[],
  startIndex = 0,
  stopType?: string,
  joinWith = "\n\n",
): { html: string; nextIndex: number } {
  const parts: string[] = [];
  let index = startIndex;

  while (index < tokens.length) {
    const token = tokens[index];
    if (stopType && token.type === stopType) {
      return { html: parts.join(joinWith), nextIndex: index + 1 };
    }

    switch (token.type) {
      case "paragraph_open": {
        const rendered = renderInlineContainer(tokens, index + 1, "paragraph_close");
        const html = collapseBlankLines(rendered.html);
        if (html) parts.push(html);
        index = rendered.nextIndex;
        continue;
      }

      case "heading_open": {
        const rendered = renderInlineContainer(tokens, index + 1, "heading_close");
        const html = collapseBlankLines(rendered.html);
        if (html) parts.push(`<b>${html}</b>`);
        index = rendered.nextIndex;
        continue;
      }

      case "blockquote_open": {
        const rendered = renderBlocks(tokens, index + 1, "blockquote_close", "\n");
        const html = collapseBlankLines(rendered.html);
        if (html) parts.push(`<blockquote>${html}</blockquote>`);
        index = rendered.nextIndex;
        continue;
      }

      case "bullet_list_open":
      case "ordered_list_open": {
        const ordered = token.type === "ordered_list_open";
        const closeType = ordered ? "ordered_list_close" : "bullet_list_close";
        const listParts: string[] = [];
        let itemNumber = Number(token.attrGet("start") ?? "1");
        if (!Number.isFinite(itemNumber) || itemNumber < 1) {
          itemNumber = 1;
        }

        index += 1;
        while (index < tokens.length && tokens[index]?.type !== closeType) {
          if (tokens[index]?.type !== "list_item_open") {
            index += 1;
            continue;
          }

          const rendered = renderBlocks(tokens, index + 1, "list_item_close", "\n");
          const body = collapseBlankLines(rendered.html);
          if (body) {
            const prefix = ordered ? `${itemNumber}. ` : "• ";
            listParts.push(`${prefix}${body.replace(/\n/g, "\n  ")}`);
          }
          if (ordered) itemNumber += 1;
          index = rendered.nextIndex;
        }

        if (listParts.length > 0) {
          parts.push(listParts.join("\n"));
        }
        if (index < tokens.length && tokens[index]?.type === closeType) {
          index += 1;
        }
        continue;
      }

      case "fence":
      case "code_block": {
        const content = stripTrailingNewlines(token.content);
        parts.push(`<pre><code>${escapeHtml(content)}</code></pre>`);
        index += 1;
        continue;
      }

      case "hr":
        parts.push("────────");
        index += 1;
        continue;

      case "inline": {
        const html = collapseBlankLines(renderTelegramInline(token.children ?? []));
        if (html) parts.push(html);
        index += 1;
        continue;
      }

      default:
        index += 1;
        continue;
    }
  }

  return { html: parts.join(joinWith), nextIndex: index };
}

function buildTelegramHtml(markdown: string): string {
  const tokens = MARKDOWN.parse(markdown ?? "", {});
  return wrapFileReferencesInHtml(collapseBlankLines(renderBlocks(tokens).html));
}

function wrapStandaloneFileRef(match: string, prefix: string, fileRef: string): string {
  if (fileRef.startsWith("//")) return match;
  if (/https?:\/\/$/i.test(prefix)) return match;
  return `${prefix}<code>${escapeHtml(fileRef)}</code>`;
}

function wrapSegmentFileRefs(
  text: string,
  codeDepth: number,
  preDepth: number,
  anchorDepth: number,
): string {
  if (!text || codeDepth > 0 || preDepth > 0 || anchorDepth > 0) {
    return text;
  }
  return text.replace(FILE_REF_PATTERN, wrapStandaloneFileRef);
}

function wrapFileReferencesInHtml(html: string): string {
  const deLinkified = html.replace(AUTO_LINKED_ANCHOR_PATTERN, (match, label: string) => {
    if (!isAutoLinkedFileRef(`http://${label}`, label)) {
      return match;
    }
    return `<code>${escapeHtml(label)}</code>`;
  });

  let codeDepth = 0;
  let preDepth = 0;
  let anchorDepth = 0;
  let result = "";
  let lastIndex = 0;

  HTML_TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_TAG_PATTERN.exec(deLinkified)) !== null) {
    const tagStart = match.index;
    const tagEnd = HTML_TAG_PATTERN.lastIndex;
    const isClosing = match[1] === "</";
    const tagName = match[2].toLowerCase();

    result += wrapSegmentFileRefs(
      deLinkified.slice(lastIndex, tagStart),
      codeDepth,
      preDepth,
      anchorDepth,
    );

    if (tagName === "code") {
      codeDepth = isClosing ? Math.max(0, codeDepth - 1) : codeDepth + 1;
    } else if (tagName === "pre") {
      preDepth = isClosing ? Math.max(0, preDepth - 1) : preDepth + 1;
    } else if (tagName === "a") {
      anchorDepth = isClosing ? Math.max(0, anchorDepth - 1) : anchorDepth + 1;
    }

    result += deLinkified.slice(tagStart, tagEnd);
    lastIndex = tagEnd;
  }

  result += wrapSegmentFileRefs(
    deLinkified.slice(lastIndex),
    codeDepth,
    preDepth,
    anchorDepth,
  );
  return result;
}

function buildTelegramHtmlOpenPrefix(tags: TelegramHtmlTag[]): string {
  return tags.map((tag) => tag.openTag).join("");
}

function buildTelegramHtmlCloseSuffix(tags: TelegramHtmlTag[]): string {
  return tags
    .slice()
    .reverse()
    .map((tag) => tag.closeTag)
    .join("");
}

function buildTelegramHtmlCloseSuffixLength(tags: TelegramHtmlTag[]): number {
  return tags.reduce((total, tag) => total + tag.closeTag.length, 0);
}

function findTelegramHtmlEntityEnd(text: string, start: number): number {
  if (text[start] !== "&") return -1;
  let index = start + 1;
  if (index >= text.length) return -1;

  if (text[index] === "#") {
    index += 1;
    if (index >= text.length) return -1;
    if (text[index] === "x" || text[index] === "X") {
      index += 1;
      while (index < text.length && /[0-9a-fA-F]/.test(text[index] ?? "")) {
        index += 1;
      }
    } else {
      while (index < text.length && /[0-9]/.test(text[index] ?? "")) {
        index += 1;
      }
    }
  } else {
    while (index < text.length && /[a-zA-Z0-9]/.test(text[index] ?? "")) {
      index += 1;
    }
  }

  return text[index] === ";" ? index : -1;
}

function findTelegramHtmlSafeSplitIndex(text: string, maxLength: number): number {
  const normalizedMaxLength = Math.max(1, Math.floor(maxLength));
  if (text.length <= normalizedMaxLength) {
    return text.length;
  }

  const newlineIndex = text.lastIndexOf("\n", normalizedMaxLength - 1);
  if (newlineIndex > 0) {
    return newlineIndex + 1;
  }

  const spaceIndex = text.lastIndexOf(" ", normalizedMaxLength - 1);
  if (spaceIndex > 0) {
    return spaceIndex + 1;
  }

  const lastAmpersand = text.lastIndexOf("&", normalizedMaxLength - 1);
  if (lastAmpersand === -1) {
    return normalizedMaxLength;
  }

  const lastSemicolon = text.lastIndexOf(";", normalizedMaxLength - 1);
  if (lastAmpersand < lastSemicolon) {
    return normalizedMaxLength;
  }

  const entityEnd = findTelegramHtmlEntityEnd(text, lastAmpersand);
  if (entityEnd === -1 || entityEnd < normalizedMaxLength) {
    return normalizedMaxLength;
  }

  return lastAmpersand;
}

function popTelegramHtmlTag(tags: TelegramHtmlTag[], name: string): void {
  for (let index = tags.length - 1; index >= 0; index -= 1) {
    if (tags[index]?.name === name) {
      tags.splice(index, 1);
      return;
    }
  }
}

// Adapted from OpenClaw's Telegram formatter (MIT).
export function splitTelegramHtmlChunks(html: string, limit: number): string[] {
  if (!html) return [];
  const normalizedLimit = Math.max(1, Math.floor(limit));
  if (html.length <= normalizedLimit) {
    return [html];
  }

  const chunks: string[] = [];
  const openTags: TelegramHtmlTag[] = [];
  let current = "";
  let chunkHasPayload = false;

  const resetCurrent = () => {
    current = buildTelegramHtmlOpenPrefix(openTags);
    chunkHasPayload = false;
  };

  const flushCurrent = () => {
    if (!chunkHasPayload) return;
    chunks.push(`${current}${buildTelegramHtmlCloseSuffix(openTags)}`);
    resetCurrent();
  };

  const appendText = (segment: string) => {
    let remaining = segment;
    while (remaining.length > 0) {
      const available =
        normalizedLimit - current.length - buildTelegramHtmlCloseSuffixLength(openTags);
      if (available <= 0) {
        if (!chunkHasPayload) {
          throw new Error(
            `Telegram HTML chunk limit exceeded by tag overhead (limit=${normalizedLimit})`,
          );
        }
        flushCurrent();
        continue;
      }
      if (remaining.length <= available) {
        current += remaining;
        chunkHasPayload = true;
        break;
      }
      const splitAt = findTelegramHtmlSafeSplitIndex(remaining, available);
      if (splitAt <= 0) {
        if (!chunkHasPayload) {
          throw new Error(
            `Telegram HTML chunk limit exceeded by leading entity (limit=${normalizedLimit})`,
          );
        }
        flushCurrent();
        continue;
      }
      current += remaining.slice(0, splitAt);
      chunkHasPayload = true;
      remaining = remaining.slice(splitAt);
      flushCurrent();
    }
  };

  resetCurrent();
  HTML_TAG_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_TAG_PATTERN.exec(html)) !== null) {
    const tagStart = match.index;
    const tagEnd = HTML_TAG_PATTERN.lastIndex;
    appendText(html.slice(lastIndex, tagStart));

    const rawTag = match[0];
    const isClosing = match[1] === "</";
    const tagName = match[2].toLowerCase();
    const isSelfClosing =
      !isClosing &&
      (TELEGRAM_SELF_CLOSING_HTML_TAGS.has(tagName) || rawTag.trimEnd().endsWith("/>"));

    if (!isClosing) {
      const nextCloseLength = isSelfClosing ? 0 : `</${tagName}>`.length;
      if (
        chunkHasPayload &&
        current.length +
          rawTag.length +
          buildTelegramHtmlCloseSuffixLength(openTags) +
          nextCloseLength >
          normalizedLimit
      ) {
        flushCurrent();
      }
    }

    current += rawTag;
    if (isSelfClosing) {
      chunkHasPayload = true;
    }
    if (isClosing) {
      popTelegramHtmlTag(openTags, tagName);
    } else if (!isSelfClosing) {
      openTags.push({
        name: tagName,
        openTag: rawTag,
        closeTag: `</${tagName}>`,
      });
    }
    lastIndex = tagEnd;
  }

  appendText(html.slice(lastIndex));
  flushCurrent();
  return chunks.length > 0 ? chunks : [html];
}

export function splitPlainTextChunks(text: string, limit: number): string[] {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > normalizedLimit) {
    let splitAt = remaining.lastIndexOf("\n", normalizedLimit - 1);
    if (splitAt <= 0) {
      splitAt = remaining.lastIndexOf(" ", normalizedLimit - 1);
    }
    if (splitAt <= 0) {
      splitAt = normalizedLimit;
    } else {
      splitAt += 1;
    }
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }

  if (remaining) {
    chunks.push(remaining);
  }
  return chunks;
}

export function renderTelegramTextChunks(
  markdown: string,
  limit = TELEGRAM_TEXT_CHUNK_LIMIT,
): TelegramTextChunk[] {
  const text = markdown.trim();
  if (!text) return [];

  try {
    const html = buildTelegramHtml(text);
    const chunks = splitTelegramHtmlChunks(html, limit);
    return chunks
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({
        text: chunk,
        parseMode: "HTML" as const,
      }));
  } catch {
    return splitPlainTextChunks(text, limit)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => ({ text: chunk }));
  }
}
