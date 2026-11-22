/*
 * What an agent wrote, drawn from its Markdown as elements, never set as
 * HTML; and what the person wrote, as the text it is.
 */
import { type ComponentChild, h } from "preact";
import { useMemo } from "preact/hooks";
import { type Md, markdown } from "./markdown.ts";

function draw(node: Md, key: number): ComponentChild {
  if (typeof node === "string") return node;
  const children = node.children.map(draw);
  if (node.tag === "a") {
    return (
      <a key={key} href={node.href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  if (node.tag === "ol") return h("ol", { key, start: node.start }, children);
  return h(node.tag, { key }, children);
}

/** Markdown, drawn. `breaks` breaks a line where the text does, as a chat message does. */
export function Prose({ text, breaks, streaming = false }: { text: string; breaks: boolean; streaming?: boolean }) {
  const drawn = useMemo(() => markdown(text, { breaks }).map(draw), [text, breaks]);
  return <div class={streaming ? "prose streaming" : "prose"}>{drawn}</div>;
}

/** Text as it was written, line breaks and all. */
export function Plain({ text, cls }: { text: string; cls?: string }) {
  return <div class={["prose", "plain", cls].filter((each) => each !== undefined).join(" ")}>{text}</div>;
}
