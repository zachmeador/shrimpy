import assert from "node:assert/strict";
import { test } from "node:test";
import { type Md, markdown } from "./markdown.ts";

/** Every element the page may draw Markdown with. */
const DRAWN = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre", "code", "strong", "em", "del", "a", "br", "hr", "table", "thead", "tbody", "tr", "th", "td"]);

const elements = (nodes: Md[]): Exclude<Md, string>[] => nodes.flatMap((node) => (typeof node === "string" ? [] : [node, ...elements(node.children)]));
const text = (nodes: Md[]): string => nodes.map((node) => (typeof node === "string" ? node : text(node.children))).join("");

test("Markdown from an agent can't put a script on the page, or have it fetch anything", () => {
  const written = [
    "<script>alert(1)</script>",
    '<img src="x" onerror="alert(2)">',
    "[a link](javascript:alert(3)) and [another](data:text/html,<script>alert(4)</script>)",
    '<a href="javascript:alert(5)">click</a>',
    "![a picture](https://example.com/watching.png)",
    "######## too deep",
    "[a page](https://example.com/page) and <mailto:me@example.com>",
  ].join("\n\n");
  const drawn = markdown(written, { breaks: true });
  const all = elements(drawn);

  assert.deepEqual(all.map((each) => each.tag).filter((tag) => !DRAWN.has(tag)), [], "only Markdown's own elements are drawn");
  assert.deepEqual(
    all.flatMap((each) => (each.href === undefined ? [] : [each.href])),
    ["https://example.com/watching.png", "https://example.com/page", "mailto:me@example.com"],
    "a link goes only to the web or to an email address, and a picture is a link, not fetched",
  );
  assert.match(text(drawn), /<script>alert\(1\)<\/script>/, "HTML is shown as the text it is");
});
