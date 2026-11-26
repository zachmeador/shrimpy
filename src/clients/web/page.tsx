/*
 * An agent's page, where a thread would be while none is open: how it stands,
 * where it lives, its commands running in the background, its standing and
 * one-time triggers, and its home as a tree, to look through and not to change.
 * A file of the home opens where the page was, as text or as the picture it is.
 */
import { useEffect, useState } from "preact/hooks";
import type { ClientState } from "../state/index.ts";
import { EMPTY, type Fact, type FileLevel, type HomeRow, LABELS, type OnceCard, type PageLevel, type ProcessCard, type TriggerCard } from "../view/index.ts";
import { Glyph, Lamp, Relief } from "./marks.tsx";
import { Head, Notes, Title } from "./thread.tsx";
import { backFrom, CONTROLS, NEW_THREAD, switchTriggerTitle } from "./words.ts";

/** The facts set in the machine's face: what a machine wrote, as names and paths are. */
const MACHINE_WRITTEN = new Set(["machine", "model", "version", "home"]);

function FactRow({ fact }: { fact: Fact }) {
  const value = MACHINE_WRITTEN.has(fact.label) ? <code>{fact.value}</code> : <span>{fact.value}</span>;
  if (fact.working) {
    return (
      <>
        <dt>{fact.label}</dt>
        <dd class="state busy">
          {value}
          <Lamp />
        </dd>
        {fact.sub !== undefined && (
          <>
            <dt />
            <dd>
              <span class="sub">{fact.sub}</span>
            </dd>
          </>
        )}
      </>
    );
  }
  return (
    <>
      <dt>{fact.label}</dt>
      <dd>
        {value}
        {fact.sub !== undefined && <span class="sub">{fact.sub}</span>}
      </dd>
    </>
  );
}

/** A running background command on its agent's page: its command, toggleable output tail, thread link, and kill button. */
function ProcessCardView({
  proc,
  open,
  toggleOutput,
  jump,
  kill,
}: {
  proc: ProcessCard;
  open: boolean;
  toggleOutput: () => void;
  jump: (agentId: string, threadId: string) => void;
  kill: () => void;
}) {
  const out = proc.output;
  return (
    <article class="file stepbox">
      <h3>$ {proc.command}</h3>
      {open && out !== undefined && <pre class="out">{"note" in out ? out.note : out.length > 0 ? out.join("\n") : EMPTY}</pre>}
      <p class="last ctl">
        <span>
          running {proc.since}
          <span class="dot">·</span>
          {proc.id}
        </span>
        <button class="lk to" type="button" title={CONTROLS.openThread} onClick={() => jump(proc.agent, proc.threadId)}>
          {proc.threadLabel}
        </button>
        <span class="gap" />
        <button class="act" type="button" aria-expanded={open} onClick={toggleOutput}>
          {open ? CONTROLS.hideOutput : CONTROLS.output}
        </button>
        <button class="act end" type="button" onClick={kill}>
          {CONTROLS.kill}
        </button>
      </p>
    </article>
  );
}

/** A standing trigger as its file, with its target thread or note, a way to run it now, and its on/off switch. */
function Card({
  card,
  jump,
  choose,
  fire,
  toggle,
}: {
  card: TriggerCard;
  jump: (agentId: string, threadId: string) => void;
  choose: (path: string) => void;
  fire: () => void;
  toggle: () => void;
}) {
  const { file, target } = card;
  return (
    <article class={`file stepbox${card.on ? "" : " off"}`}>
      <h3>
        {card.path}
        {!card.on && <span class="tag">{CONTROLS.off}</span>}
      </h3>
      {file !== undefined && "note" in file && <p class="last">{file.note}</p>}
      {file !== undefined && !("note" in file) && (
        <pre>
          {file.front !== undefined && <i>{["---", ...file.front, "---"].join("\n")}</i>}
          {file.body !== "" && `${file.front === undefined ? "" : "\n"}${file.body}`}
        </pre>
      )}
      <p class="last ctl">
        <span>
          {card.when.split(" · ").map((part, at) => (
            <span key={part}>
              {at > 0 && <span class="dot">·</span>}
              {part}
            </span>
          ))}
        </span>
        {target.kind === "thread" ? (
          <button class="lk to" type="button" title={CONTROLS.openThread} onClick={() => jump(card.agent, target.threadId)}>
            {target.label}
          </button>
        ) : (
          <button class="lk to" type="button" title={CONTROLS.openNote} onClick={() => choose(target.path)}>
            {target.path}
          </button>
        )}
        <span class="gap" />
        <button class="act" type="button" onClick={fire}>
          {CONTROLS.runNow}
        </button>
        <button class="act toggle" type="button" role="switch" aria-checked={card.on} title={switchTriggerTitle(card.on)} onClick={toggle}>
          {card.on ? CONTROLS.on : CONTROLS.off}
        </button>
      </p>
    </article>
  );
}

/** Pending one-time triggers of the agent, listed under its standing ones. */
function OnceList({
  once,
  jump,
  cancel,
}: {
  once: OnceCard[];
  jump: (agentId: string, threadId: string) => void;
  cancel: (agentId: string, triggerId: string) => void;
}) {
  if (once.length === 0) return null;
  return (
    <ul class="onces stepbox">
      <li class="top">{CONTROLS.once}</li>
      {once.map((item) => (
        <li key={item.id} class="titem cp">
          <time>{item.when}</time>
          <span class="say">{item.prompt}</span>
          <button class="lk to" type="button" title={CONTROLS.openThread} onClick={() => jump(item.agent, item.threadId)}>
            {item.threadLabel}
          </button>
          <button class="act" type="button" onClick={() => cancel(item.agent, item.id)}>
            {CONTROLS.cancel}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A line of the tree of the home: a folder opens in place, a file opens where the page was, and anything else is only named. */
function TreeRow({ row, toggle, choose }: { row: HomeRow; toggle: (path: string) => void; choose: (path: string) => void }) {
  const indent = `--depth:${String(row.depth)}`;
  switch (row.kind) {
    case "folder":
      return (
        <button class="frow dir" type="button" aria-expanded={row.open} style={indent} onClick={() => toggle(row.path)}>
          <Glyph name="fold" />
          <span>{row.name}/</span>
        </button>
      );
    case "file":
      return (
        <button class="frow" type="button" style={indent} onClick={() => choose(row.path)}>
          <span class="slot" />
          <span>{row.name}</span>
        </button>
      );
    case "other":
      return (
        <p class="frow other" style={indent}>
          <span class="slot" />
          <span>{row.name}</span>
        </p>
      );
    case "empty":
      return (
        <p class="none" style={indent}>
          {EMPTY}
        </p>
      );
    case "note":
      return <p class="note stepbox">{row.name}</p>;
  }
}

interface PageViewProps {
  state: ClientState;
  page: PageLevel;
  /** The folders of the home open in its tree, which are read again with the page. */
  opened: ReadonlySet<string>;
  /** A thread can be started from here. */
  startable: boolean;
  /** The page is drawn small, as on a phone. */
  small: boolean;
  /** The agent is reached, so what is read of its home is read again once it is. */
  reached: boolean;
  retry: string | undefined;
  back: () => void;
  start: () => void;
  toggle: (path: string) => void;
  choose: (path: string) => void;
  jump: (agentId: string, threadId: string) => void;
}

/** The page of the agent whose list is open. Its home and its triggers' files are read again each time it is shown, and when a trigger comes or goes. */
export function PageView({ state, page, opened, startable, small, reached, retry, back, start, toggle, choose, jump }: PageViewProps) {
  const [openTails, setOpenTails] = useState<ReadonlySet<string>>(() => new Set());
  const triggers = (page.triggers ?? []).map((card) => card.path).join("\n");
  useEffect(() => {
    if (!page.off) state.readPage(opened);
  }, [state, page.off, reached, triggers]);

  const openTailKey = page.processes
    .filter((proc) => openTails.has(proc.id))
    .map((proc) => proc.id)
    .join("\n");
  useEffect(() => {
    if (page.off || openTailKey === "") return;
    for (const id of openTailKey.split("\n")) state.readProcessOutput(page.agent, id);
  }, [state, page.agent, page.off, reached, openTailKey]);

  const toggleOutput = (procId: string): void => {
    setOpenTails((before) => {
      const next = new Set(before);
      if (!next.delete(procId)) {
        next.add(procId);
        state.readProcessOutput(page.agent, procId);
      }
      return next;
    });
  };

  return (
    <>
      <Head
        back={back}
        backLabel={backFrom("threads", page.name)}
        acts={
          startable ? (
            <button class="ib" type="button" title={NEW_THREAD} aria-label={NEW_THREAD} onClick={start}>
              <Glyph name="plus" />
            </button>
          ) : undefined
        }
      >
        <div class={`titles pg-${page.look.pigment}`}>
          <h1>
            <b class="who">{page.name}</b>
          </h1>
        </div>
      </Head>
      <div class="body">
        <div class="scroll">
          <div class="col page">
            <Notes notes={page.notes} retry={retry} />
            <div class="about">
              <Relief sigil={page.look.sigil} cell={small ? 6 : 10} />
              <dl>
                {page.facts.map((fact) => (
                  <FactRow key={fact.label} fact={fact} />
                ))}
              </dl>
            </div>
            {page.note !== undefined ? (
              <p class="note stepbox">{page.note}</p>
            ) : (
              <>
                {page.processes.length > 0 && (
                  <>
                    <h2 class="label">{LABELS.processes}</h2>
                    {page.processes.map((proc) => (
                      <ProcessCardView
                        key={proc.id}
                        proc={proc}
                        open={openTails.has(proc.id)}
                        toggleOutput={() => toggleOutput(proc.id)}
                        jump={jump}
                        kill={() => void state.killProcess(proc.agent, proc.id)}
                      />
                    ))}
                  </>
                )}
                <h2 class="label">{LABELS.triggers}</h2>
                {page.triggers?.length === 0 && page.once.length === 0 && <p class="hint">{page.noTriggers}</p>}
                {page.triggers?.map((card) => (
                  <Card
                    key={card.path}
                    card={card}
                    jump={jump}
                    choose={choose}
                    fire={() => void state.fireTrigger(card.agent, card.name)}
                    toggle={() => void state.switchTrigger(card.agent, card.name, !card.on)}
                  />
                ))}
                <OnceList once={page.once} jump={jump} cancel={(agentId, triggerId) => void state.cancelTrigger(agentId, triggerId)} />
                <h2 class="label">{LABELS.home}</h2>
                <div class="tree">
                  {page.home.map((row) => (
                    <TreeRow key={`${row.kind} ${row.path}`} row={row} toggle={toggle} choose={choose} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

interface FileViewProps {
  state: ClientState;
  file: FileLevel;
  /** The agent is reached, so the file is read again once it is. */
  reached: boolean;
  back: () => void;
}

/** A file of the agent's home, where its page was, with its size as its folder lists it, and back to the page. */
export function FileView({ state, file, reached, back }: FileViewProps) {
  const { path, shown } = file;
  useEffect(() => {
    state.readFile(path);
    const at = path.lastIndexOf("/");
    state.readFolder(at === -1 ? "" : path.slice(0, at));
  }, [state, path, reached]);

  return (
    <>
      <Head back={back} backLabel={backFrom("page", file.name)} always>
        <div class={`titles pg-${file.look.pigment}`}>
          <Title who={file.name} rest={path} stale={false} path />
          {file.size !== undefined && <p class="sub">{file.size}</p>}
        </div>
      </Head>
      <div class="body">
        <div class="scroll">
          <div class="col">
            {shown?.kind === "text" && <pre class="filetext">{shown.text}</pre>}
            {shown?.kind === "image" && <img class="picture" src={`data:${shown.mediaType};base64,${shown.data}`} alt={path} />}
            {shown?.kind === "empty" && <p class="hint">{EMPTY}</p>}
            {shown?.kind === "note" && <p class="note stepbox">{shown.note}</p>}
          </div>
        </div>
      </div>
    </>
  );
}
