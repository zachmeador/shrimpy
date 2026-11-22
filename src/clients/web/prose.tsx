/*
 * What an agent wrote, drawn from its Markdown as elements, never set as
 * HTML; and what the person wrote, as the text it is. Each `@name` of an agent
 * a message mentions is in that agent's pigment.
 */
import { type ComponentChild, h } from "preact";
import { useMemo } from "preact/hooks";
import { type Mention, withMentions } from "../view/index.ts";
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
  if (node.tag === "span") return h("span", { key, class: `mention pg-${node.pigment ?? ""}` }, children);
  if (node.tag === "ol") return h("ol", { key, start: node.start }, children);
  return h(node.tag, { key }, children);
}

const NONE: readonly Mention[] = [];

/** Markdown, drawn. `breaks` breaks a line where the text does, as a chat message does. */
export function Prose({ text, breaks, streaming = false, mentions = NONE }: { text: string; breaks: boolean; streaming?: boolean; mentions?: readonly Mention[] }) {
  const drawn = useMemo(() => markdown(text, { breaks, mentions }).map(draw), [text, breaks, mentions]);
  return <div class={streaming ? "prose streaming" : "prose"}>{drawn}</div>;
}

/** Text as it was written, line breaks and all. */
export function Plain({ text, cls, mentions = NONE }: { text: string; cls?: string; mentions?: readonly Mention[] }) {
  const said = withMentions(text, mentions).map((part, at) =>
    typeof part === "string" ? (
      part
    ) : (
      <span key={at} class={`mention pg-${part.look.pigment}`}>
        {part.mention}
      </span>
    ),
  );
  return <div class={["prose", "plain", cls].filter((each) => each !== undefined).join(" ")}>{said}</div>;
}
