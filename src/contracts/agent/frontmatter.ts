const KEY = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/;
const BLOCK = /^[|>][+-]?\d*$/;

/**
 * The values of the `key: value` lines in the front matter at the top of a
 * Markdown file, the block between two `---` lines, or undefined when the file
 * has none or never closes it. It reads the part of YAML skills use: plain and
 * quoted values, and values that go on over indented lines or start with `|`
 * or `>`. Each value comes back as one line, with its line breaks and runs of
 * spaces made into single spaces. Comments, lists and nested keys are not read.
 */
export function frontmatter(text: string): Map<string, string> | undefined {
  return frontmatterAndBody(text)?.values;
}

/** The front matter of a Markdown file as `frontmatter` reads it, and the text after its closing line. */
export function frontmatterAndBody(text: string): { values: Map<string, string>; body: string } | undefined {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  if (lines[0]?.trimEnd() !== "---") return undefined;
  const end = lines.findIndex((line, index) => index > 0 && line.trimEnd() === "---");
  if (end === -1) return undefined;

  const values = new Map<string, string>();
  let key: string | undefined;
  let first = "";
  let more: string[] = [];
  const finish = (): void => {
    if (key !== undefined) values.set(key, oneLine(value(first, more)));
  };
  for (const line of lines.slice(1, end)) {
    if (line.trimStart().startsWith("#")) continue;
    const match = KEY.exec(line);
    if (match !== null) {
      finish();
      key = match[1];
      first = match[2] ?? "";
      more = [];
    } else if (key !== undefined) {
      more.push(line.trim());
    }
  }
  finish();
  return { values, body: lines.slice(end + 1).join("\n") };
}

function value(first: string, more: string[]): string {
  const start = first.trim();
  if (BLOCK.test(start)) return more.join(" ");
  const quote = start.charAt(0);
  if ((quote === '"' || quote === "'") && start.length > 1 && start.endsWith(quote)) return unquoted(start);
  return [start, ...more].join(" ");
}

function unquoted(text: string): string {
  const inside = text.slice(1, -1);
  if (text.startsWith("'")) return inside.replaceAll("''", "'");
  try {
    return JSON.parse(text) as string;
  } catch {
    return inside;
  }
}

/** Line breaks and runs of spaces made into single spaces, and nothing at either end. */
export function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
