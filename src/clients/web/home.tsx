/*
 * An agent's home and triggers, to look through and not to change: its
 * folders as a tree in its list, a file of it in the thread's place, shown as
 * Markdown, as text or as the picture it is, and its triggers, each with what
 * defines it and when it runs.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import { type HomeEntry, type HomeFile, type TriggerDetail, triggerHeading, type TriggerSummary } from "../../contracts/agent/index.ts";
import type { AgentRead, ClientState } from "../state/index.ts";
import { EMPTY, homeNote, lastOccurrence, noTriggers, sizeWords, triggerLines, triggerNote } from "../view/index.ts";
import { Glyph } from "./marks.tsx";
import { Prose } from "./prose.tsx";
import { Head, Title } from "./thread.tsx";
import { SELF } from "./words.ts";

/** The folders a file is in, from the home's top down: "a", then "a/b", for "a/b/c.md". */
const foldersOf = (path: string | undefined): string[] =>
  (path ?? "")
    .split("/")
    .slice(0, -1)
    .map((_, at, parts) => parts.slice(0, at + 1).join("/"));

interface HomeTreeProps {
  state: ClientState;
  /** The agent's name, to say whose home could not be read. */
  name: string;
  /** The file open, by its path in the home. */
  current: string | undefined;
  choose: (path: string) => void;
}

/** The agent's home as a tree, each folder read when it is opened. */
export function HomeTree({ state, name, current, choose }: HomeTreeProps) {
  const [folders, setFolders] = useState(() => new Map<string, AgentRead<HomeEntry[]>>());
  const [opened, setOpened] = useState(() => new Set(foldersOf(current)));

  const read = (path: string): void => {
    void state.folder(path).then((found) => setFolders((before) => new Map(before).set(path, found)));
  };
  useEffect(() => {
    for (const path of ["", ...opened]) read(path);
    // The tree is read again whenever it is shown, and the folders opened in it are each read when opened.
  }, []);

  const toggle = (path: string): void => {
    const next = new Set(opened);
    if (next.delete(path)) return setOpened(next);
    next.add(path);
    setOpened(next);
    if (!folders.has(path)) read(path);
  };

  const entries = (path: string, depth: number): ComponentChildren => {
    const found = folders.get(path);
    if (found === undefined) return null;
    if ("problem" in found) return <p class="note stepbox">{homeNote(name, found.problem, SELF)}</p>;
    if (found.value.length === 0) return <p class="none" style={`--depth:${String(depth)}`}>{EMPTY}</p>;
    // Folders first, as a tree of files reads.
    const sorted = [...found.value].sort((a, b) => Number(b.kind === "folder") - Number(a.kind === "folder"));
    return sorted.map((entry) => {
      const full = path === "" ? entry.name : `${path}/${entry.name}`;
      const indent = `--depth:${String(depth)}`;
      if (entry.kind === "folder") {
        const open = opened.has(full);
        return (
          <div key={full}>
            <button class="frow dir" type="button" aria-expanded={open} style={indent} onClick={() => toggle(full)}>
              <Glyph name="fold" />
              <span>{entry.name}/</span>
            </button>
            {open && entries(full, depth + 1)}
          </div>
        );
      }
      if (entry.kind === "file") {
        return (
          <button key={full} class="frow" type="button" aria-current={current === full} style={indent} onClick={() => choose(full)}>
            <span class="slot" />
            <span>{entry.name}</span>
          </button>
        );
      }
      return (
        <p key={full} class="frow other" style={indent}>
          <span class="slot" />
          <span>{entry.name}</span>
        </p>
      );
    });
  };

  return <div class="tree">{entries("", 0)}</div>;
}

/** A file of the agent's home, in the thread's place, with its size as its folder lists it. */
export function FileView({ state, name, path, back }: { state: ClientState; name: string; path: string; back: () => void }) {
  const [read, setRead] = useState<AgentRead<HomeFile> | undefined>(undefined);
  const [size, setSize] = useState<number | null>(null);
  useEffect(() => {
    let current = true;
    setRead(undefined);
    setSize(null);
    void state.file(path).then((found) => {
      if (current) setRead(found);
    });
    const at = path.lastIndexOf("/");
    void state.folder(at === -1 ? "" : path.slice(0, at)).then((found) => {
      const entry = "value" in found ? found.value.find((each) => each.name === path.slice(at + 1)) : undefined;
      if (current) setSize(entry?.size ?? null);
    });
    return () => {
      current = false;
    };
  }, [state, path]);

  let shown: ComponentChildren = null;
  if (read !== undefined && "problem" in read) shown = <p class="note stepbox">{homeNote(name, read.problem, SELF)}</p>;
  else if (read?.value.kind === "image") shown = <img class="picture" src={`data:${read.value.mediaType};base64,${read.value.data}`} alt={path} />;
  else if (read?.value.text === "") shown = <p class="hint">{EMPTY}</p>;
  else if (read !== undefined && path.endsWith(".md")) shown = <Prose text={read.value.text} breaks={false} />;
  else if (read !== undefined) shown = <pre class="filetext">{read.value.text}</pre>;

  return (
    <>
      <Head back={back}>
        <div class="titles">
          <Title who={name} rest={path} stale={false} path />
          {size !== null && <p class="sub">{sizeWords(size)}</p>}
        </div>
      </Head>
      <div class="body">
        <div class="scroll">
          <div class="col">{shown}</div>
        </div>
      </div>
    </>
  );
}

/** The agent's triggers, each as `shrimpy triggers` says it: whether it is on, what defines it, when it runs next and how it last went. */
export function TriggerCards({ state, name, triggers, now }: { state: ClientState; name: string; triggers: TriggerSummary[] | undefined; now: number }) {
  const [details, setDetails] = useState(() => new Map<string, AgentRead<TriggerDetail>>());
  const names = (triggers ?? []).map((trigger) => trigger.name).join("\n");
  useEffect(() => {
    for (const trigger of triggers ?? []) {
      void state.trigger(trigger.name).then((found) => setDetails((before) => new Map(before).set(trigger.name, found)));
    }
  }, [names]);

  if (triggers === undefined) return null;
  if (triggers.length === 0) return <p class="hint">{noTriggers(name)}</p>;
  return (
    <>
      {triggers.map((trigger) => {
        const detail = details.get(trigger.name);
        return (
          <article key={trigger.name} class="file stepbox">
            <h3>{triggerHeading(trigger)}</h3>
            {detail !== undefined && "value" in detail && (
              <pre>
                {triggerLines(detail.value, now).map((line, at) => (
                  <span key={at}>{line}</span>
                ))}
              </pre>
            )}
            {detail !== undefined && "problem" in detail && <p class="last">{triggerNote(name, detail.problem, SELF)}</p>}
            <p class="last">{lastOccurrence(trigger, now)}</p>
          </article>
        );
      })}
    </>
  );
}
