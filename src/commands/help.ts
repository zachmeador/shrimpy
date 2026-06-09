import { formatVersionLabel, readAppMetadata } from "../app/metadata.js";
import { brand, dim, heading } from "../util/style.js";
import {
  CLI_CATEGORIES,
  CLI_COMMAND_CATALOG,
  completionPaths,
  formatCommandUsage,
} from "./catalog.js";

interface CliHelpRenderOptions {
  full?: boolean;
}

export function renderCliHelp(options: CliHelpRenderOptions = {}): string {
  const metadata = readAppMetadata();
  const rows = CLI_COMMAND_CATALOG
    .filter((command) => options.full || command.visibility === "default")
    .map((command) => ({
      category: command.category,
      usage: formatCommandUsage(command),
      summary: command.summary,
    }));
  const body = CLI_CATEGORIES
    .map((category) => {
      const categoryRows = rows.filter((row) => row.category === category);
      if (categoryRows.length === 0) return "";
      return [
        heading(`${category}:`),
        ...categoryRows.map((row) => styleHelpRow(row.usage, row.summary)),
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return `${brand(formatVersionLabel(metadata))} - ${dim(metadata.description)}\n\n${heading("usage:")}\n${body}`;
}

export function renderCommandPathHelp(path: readonly string[]): string {
  if (path.length === 0) return renderCliHelp();

  const entries = CLI_COMMAND_CATALOG.filter((command) => pathIsPrefix(path, command.path));
  if (entries.length === 0) {
    return `${heading("usage:")}\n${["shrimpy", ...path].join(" ")}`;
  }

  return [
    heading("usage:"),
    ...entries.map((command) => styleHelpRow(formatCommandUsage(command), command.summary)),
  ].join("\n");
}

export function resolveCliHelpPath(argv: readonly string[]): string[] | null {
  const endOfOptionsIndex = argv.indexOf("--");
  const searchableArgs = endOfOptionsIndex === -1 ? argv : argv.slice(0, endOfOptionsIndex);
  const helpIndex = searchableArgs.findIndex(isHelpFlag);
  if (helpIndex === -1) return null;

  const argsBeforeHelp = searchableArgs.slice(0, helpIndex);
  if (argsBeforeHelp.length === 0) return [];

  let best: string[] | null = null;
  for (const path of completionPaths()) {
    if (path.length === 0 || path.length > argsBeforeHelp.length) continue;
    if (!path.every((part, index) => argsBeforeHelp[index] === part)) continue;
    if (best === null || path.length > best.length) best = path;
  }
  return best;
}

export function isHelpFlag(value: string | undefined): boolean {
  return value === "--help" || value === "-h";
}

const HELP_WIDTH = 80;
const INLINE_DESCRIPTION_COLUMN = 44;
const INLINE_USAGE_WIDTH = INLINE_DESCRIPTION_COLUMN - 4;
const CONTINUATION_INDENT = "    ";

function styleHelpRow(usage: string, summary: string): string {
  if (usage.length <= INLINE_USAGE_WIDTH) {
    return styleInlineHelpRow(usage, summary);
  }
  return [
    ...wrapWords(usage, HELP_WIDTH - 2, HELP_WIDTH - CONTINUATION_INDENT.length)
      .map((line, index) => styleUsage(`${index === 0 ? "  " : CONTINUATION_INDENT}${line}`)),
    ...wrapWords(summary, HELP_WIDTH - CONTINUATION_INDENT.length)
      .map((line) => `${CONTINUATION_INDENT}${dim(line)}`),
  ].join("\n");
}

function styleInlineHelpRow(usage: string, summary: string): string {
  const summaryWidth = HELP_WIDTH - INLINE_DESCRIPTION_COLUMN;
  const summaryLines = wrapWords(summary, summaryWidth);
  const [firstSummary = "", ...rest] = summaryLines;
  return [
    `${styleUsage(`  ${usage}`.padEnd(INLINE_DESCRIPTION_COLUMN))}${dim(firstSummary)}`,
    ...rest.map((line) => `${" ".repeat(INLINE_DESCRIPTION_COLUMN)}${dim(line)}`),
  ].join("\n");
}

function styleUsage(line: string): string {
  const match = line.match(/^(\s*)(shrimpy)(.*)$/);
  if (!match) return line;
  const [, indent, name, rest] = match;
  return `${indent}${brand(name)}${rest}`;
}

function wrapWords(
  text: string,
  firstLineWidth: number,
  continuationWidth = firstLineWidth,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  let width = firstLineWidth;

  for (const word of words) {
    if (!line) {
      line = word;
      continue;
    }
    if (line.length + 1 + word.length <= width) {
      line += ` ${word}`;
      continue;
    }
    lines.push(line);
    line = word;
    width = continuationWidth;
  }

  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

function pathIsPrefix(prefix: readonly string[], path: readonly string[]): boolean {
  return prefix.every((part, index) => path[index] === part);
}
