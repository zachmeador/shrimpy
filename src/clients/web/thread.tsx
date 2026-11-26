/*
 * The third level: the open thread, with the work of each agent in it, what
 * is happening now, what is still going between turns, and the input; or,
 * with nothing open, a shape pressed into the pane and what to do.
 */
import { type ComponentChildren, createContext, Fragment } from "preact";
import { useContext, useEffect, useRef } from "preact/hooks";
import { MAX_NAME } from "../../contracts/gateway/index.ts";
import type { AgentWork, InFull, MessageRow, StillProcess, StillTrigger, StillWatch, ThreadLevel, ThreadStill } from "../view/index.ts";
import { backgroundCommandsCount, commandParts, EMPTY, FIRED, moreCount, NEW_SINCE, NOT_RUNNING, OUT_OF_DATE_MARK } from "../view/index.ts";
import { Composer, type ComposerProps } from "./composer.tsx";
import { Glyph, Lamp, Relief, Sigil } from "./marks.tsx";
import { Plain, Prose } from "./prose.tsx";
import { WorkBlock, WorkRow } from "./work.tsx";
import { answerTitle, CONTROLS, stopWaitingTitle, THREAD_MENU, TURN_OVER, waitThreadTitle } from "./words.ts";

/** Which rows of the thread's `.still` block are opened in place. */
export interface StillOpen {
  proc: boolean;
  wait: boolean;
  trig: boolean;
}

/** The note that offers to reload the page, when the gateway runs a newer Shrimpy than the page. */
export const ReloadOffer = createContext<string | undefined>(undefined);

/** A note on what is not working, the first with when the page tries again, where it does, and the offer to reload with its button. */
export function Notes({ notes, retry }: { notes: string[]; retry: string | undefined }) {
  const offer = useContext(ReloadOffer);
  return (
    <>
      {notes.map((note, at) => (
        <p key={note} class="note stepbox">
          {note}
          {at === 0 && retry !== undefined && <span class="retry">{retry}</span>}
          {note === offer && (
            <button class="lk reload" type="button" onClick={() => location.reload()}>
              {CONTROLS.reload}
            </button>
          )}
        </p>
      ))}
    </>
  );
}

/**
 * The head of the third level: the way back, on a narrow page or `always`, and
 * what it says it goes back to, what is open, and what can be done with it.
 */
export function Head({
  back,
  backLabel = CONTROLS.back,
  always = false,
  children,
  acts,
}: {
  back: () => void;
  backLabel?: string;
  always?: boolean;
  children: ComponentChildren;
  acts?: ComponentChildren;
}) {
  return (
    <header class="head thead">
      <button class={always ? "ib" : "ib only-narrow"} type="button" aria-label={backLabel} onClick={back}>
        <Glyph name="back" />
      </button>
      {children}
      {acts !== undefined && <div class="acts">{acts}</div>}
    </header>
  );
}

/** What is open, as a head names it: who it is with, set apart, then what it is, whether it may be out of date, and the word that marks it. */
export function Title({ who, rest, stale, path, tag }: { who: string; rest: string; stale: boolean; path?: boolean; tag?: string | undefined }) {
  const said = (
    <>
      <b class="who">{who}</b>
      <span class="dot">·</span>
      <span class={path === true ? "rest path" : "rest"}>{rest}</span>
      {stale && <span class="stale-tag">{OUT_OF_DATE_MARK}</span>}
    </>
  );
  if (tag === undefined) return <h1>{said}</h1>;
  return (
    <h1 class="tagged">
      <span class="clip">{said}</span>
      <span class="tag">{tag}</span>
    </h1>
  );
}

/**
 * The thread's name as an input where it stands, after who the thread is with:
 * Enter keeps what is typed, and Esc or leaving it puts the old name back.
 */
function Naming({ who, name, called, keep, leave }: { who: string; name: string; called: string; keep: (typed: string) => void; leave: () => void }) {
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => {
    box.current?.focus();
    box.current?.select();
  }, []);
  return (
    <h1 class="naming">
      <b class="who">{who}</b>
      <span class="dot">·</span>
      <span class="rename stepbox">
        <input
          ref={box}
          type="text"
          maxLength={MAX_NAME}
          enterKeyHint="done"
          defaultValue={name}
          placeholder={called}
          aria-label={CONTROLS.threadName}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.isComposing) {
              event.preventDefault();
              keep(event.currentTarget.value);
            } else if (event.key === "Escape") {
              // Esc puts the old name back, and goes back no further.
              event.preventDefault();
              event.stopPropagation();
              leave();
            }
          }}
          onBlur={leave}
        />
      </span>
    </h1>
  );
}

/** A wake line: a trigger that fired, a background command that ended or checked in, or an agent that answered. */
function Wake({ row, jump }: { row: MessageRow; jump: (agentId: string, threadId: string) => void }) {
  const { wake } = row;
  if (wake === undefined) return null;
  if (wake.kind === "answer") {
    return (
      <>
        {row.firstNew && <div class="mark new">{NEW_SINCE}</div>}
        <p class={`trig pg-${wake.fromLook.pigment}`}>
          <button type="button" title={answerTitle(wake.fromName)} onClick={() => jump(wake.agent, wake.threadId)}>
            <Sigil look={wake.fromLook} size="s12" />
            <span>
              <b>{wake.fromName}</b>{" "}
              <span class={wake.stopped ? "bad" : undefined}>{wake.how}</span>
              <span class="dot">·</span>
              {row.when}
            </span>
            {wake.title !== "" && <span class="to">{wake.title}</span>}
          </button>
        </p>
        <Receipts row={row} under />
      </>
    );
  }
  if (wake.kind === "process") {
    return (
      <>
        {row.firstNew && <div class="mark new">{NEW_SINCE}</div>}
        <details class="trig">
          <summary>
            <Glyph name="prompt" />
            <code>$ {wake.command}</code>
            <span class={wake.failed ? "bad" : undefined}>
              {wake.how}
              <span class="dot">·</span>
              {row.when}
            </span>
            <Glyph name="fold" />
          </summary>
          <pre>{wake.brought === "" ? EMPTY : wake.brought}</pre>
        </details>
        <Receipts row={row} under />
      </>
    );
  }
  return (
    <>
      {row.firstNew && <div class="mark new">{NEW_SINCE}</div>}
      <details class="trig">
        <summary>
          <Glyph name="clock" />
          <span>
            <b>{wake.label}</b> {FIRED}
            <span class="dot">·</span>
            {row.when}
          </span>
          <Glyph name="fold" />
        </summary>
        <pre>{wake.brought === "" ? EMPTY : wake.brought}</pre>
      </details>
      <Receipts row={row} under />
    </>
  );
}

/** What the agents did with a message or a wake line, where that is worth saying. */
function Receipts({ row, under }: { row: MessageRow; under?: boolean }) {
  return (
    <>
      {row.receipts.map(({ words, failed }) => (
        <p key={words} class={`receipt${failed ? " bad" : ""}${under === true ? " of-trig" : ""}`}>
          <Glyph name={failed ? "fail" : "bang"} />
          {words}
        </p>
      ))}
    </>
  );
}

/** What a message says: that it was deleted, a command as it was written, an agent's Markdown, or a person's words as typed. */
function Words({ row }: { row: MessageRow }) {
  if (row.deleted) return <p class="deleted">{row.text}</p>;
  if (row.command) {
    return (
      <div class="prose plain">
        <p class="cmd">{row.text}</p>
      </div>
    );
  }
  return row.agent ? <Prose text={row.text} breaks mentions={row.mentions} /> : <Plain text={row.text} mentions={row.mentions} />;
}

/** A message, after a line of its own where it is the first that was new, or a wake line. */
function Message({ row, cont, jump }: { row: MessageRow; cont: boolean; jump: (agentId: string, threadId: string) => void }) {
  if (row.kind === "wake") return <Wake row={row} jump={jump} />;
  return (
    <>
      {row.firstNew && <div class="mark new">{NEW_SINCE}</div>}
      <article class={`msg ${row.look === undefined ? "pg-you" : `pg-${row.look.pigment}`}${cont ? " cont" : ""}`}>
        {cont ? <span /> : <Sigil look={row.look} />}
        <div>
          {!cont && (
            <header>
              <b class="who">{row.who}</b>
              <time>{row.when}</time>
              {row.edited !== undefined && <span class="edited">{row.edited}</span>}
            </header>
          )}
          <Words row={row} />
          {row.reactions.length > 0 && (
            <div class="reactions">
              {row.reactions.map(({ emoji, by }) => (
                <span key={emoji} class="react">
                  {emoji}
                  <span>{by}</span>
                </span>
              ))}
            </div>
          )}
          <Receipts row={row} />
        </div>
      </article>
    </>
  );
}

/** A sentence with each command in it set apart, as `tag`: a key to write, or a command to run. */
function Said({ text, tag }: { text: string; tag: "kbd" | "code" }) {
  return (
    <>
      {commandParts(text).map((part, at) => {
        if (!part.command) return part.text;
        return tag === "kbd" ? <kbd key={at}>{part.text}</kbd> : <code key={at}>{part.text}</code>;
      })}
    </>
  );
}

function ProcessTail({ output }: { output: StillProcess["output"] }) {
  if (output === undefined) return null;
  if ("note" in output) return <pre>{output.note}</pre>;
  return <pre>{output.length > 0 ? output.join("\n") : EMPTY}</pre>;
}

/** What is still going in a thread between turns: background commands, open watches, triggers, and agents waiting on this thread. */
function Still({
  still,
  open,
  toggle,
  jump,
  killProcess,
  cancelWatch,
  cancelTrigger,
  switchTrigger,
}: {
  still: ThreadStill;
  open: StillOpen;
  toggle: (which: keyof StillOpen) => void;
  jump: (agentId: string, threadId: string) => void;
  killProcess: (agentId: string, procId: string) => void;
  cancelWatch: (agentId: string, watchId: string) => void;
  cancelTrigger: (agentId: string, triggerId: string) => void;
  switchTrigger: (agentId: string, name: string, on: boolean) => void;
}) {
  const { manyAgents, processes, watches, triggers, waitedBy } = still;
  if (processes.length === 0 && watches.length === 0 && triggers.length === 0 && waitedBy.length === 0) return null;

  const whose = (agentName: string): string => (manyAgents ? `${agentName} · ` : "");
  const [firstProc] = processes;
  const loneProc = processes.length === 1;

  const watchGroups: { byAgent: string; byName: string; items: StillWatch[] }[] = [];
  for (const w of watches) {
    const group = watchGroups.find((each) => each.byAgent === w.byAgent);
    if (group !== undefined) group.items.push(w);
    else watchGroups.push({ byAgent: w.byAgent, byName: w.byName, items: [w] });
  }

  const pair = (w: StillWatch) => (
    <span class="pair">
      <button class={`on pg-${w.onLook.pigment}`} type="button" title={waitThreadTitle(w.byName, w.onName)} onClick={() => jump(w.byAgent, w.toThread)}>
        <Sigil look={w.onLook} size="s12" off={!w.onRunning} />
        {w.onName}
      </button>
      <span class={`age${w.onRunning ? "" : " down"}`}>
        {w.since}
        {!w.onRunning && ` · ${NOT_RUNNING}`}
      </span>
    </span>
  );

  const [firstTrig] = triggers;
  const trigSaid = (t: StillTrigger): string =>
    `${whose(t.agentName)}${t.kind === "once" ? `once at ${t.when} · ${t.say}` : `trigger ${t.id} · ${t.on ? `next ${t.when}` : t.when}`}`;
  const trigAction = (t: StillTrigger) =>
    t.kind === "once" ? (
      <button class="act" type="button" onClick={() => cancelTrigger(t.agent, t.id)}>
        {CONTROLS.cancel}
      </button>
    ) : (
      <button class="act" type="button" onClick={() => switchTrigger(t.agent, t.id, !t.on)}>
        {t.on ? CONTROLS.pause : CONTROLS.resume}
      </button>
    );

  return (
    <section class="still stepbox" aria-label={CONTROLS.stillGoing}>
      {firstProc !== undefined && (
        <>
          <button
            class={`srow${open.proc && loneProc ? " whole" : ""}`}
            type="button"
            aria-expanded={open.proc}
            title={CONTROLS.stillProcTitle}
            onClick={() => toggle("proc")}
          >
            <span class="mk">
              <Lamp />
            </span>
            <span class="what">{open.proc && !loneProc ? backgroundCommandsCount(processes.length) : <code>$ {firstProc.command}</code>}</span>
            {!open.proc && <span class="age">running {firstProc.since}</span>}
            {!open.proc && !loneProc && <span class="more">{moreCount(processes.length - 1)}</span>}
            <Glyph name="fold" />
          </button>
          {open.proc && (
            <ul class="sbody">
              {processes.map((proc) => (
                <li key={`${proc.agent}\n${proc.id}`}>
                  {!loneProc && <p class="cmd">$ {proc.command}</p>}
                  <ProcessTail output={proc.output} />
                  <p class="foot">
                    <span>
                      {whose(proc.agentName)}
                      {proc.id}
                      <span class="dot">·</span>
                      started {proc.started}
                      <span class="dot">·</span>
                      running {proc.since}
                    </span>
                    <button class="act end" type="button" onClick={() => killProcess(proc.agent, proc.id)}>
                      {CONTROLS.kill}
                    </button>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {watchGroups.map((group) => (
        <Fragment key={group.byAgent}>
          <div class="srow wrap">
            <span class="mk">
              <Glyph name="wait" />
            </span>
            <span class="what">
              {manyAgents ? `${group.byName} is waiting on` : "waiting on"}
              {!open.wait &&
                group.items.map((w) => (
                  <Fragment key={w.id}>
                    {" "}
                    {pair(w)}
                  </Fragment>
                ))}
            </span>
            <button
              class="unfold"
              type="button"
              aria-expanded={open.wait}
              title={CONTROLS.stillWaitTitle}
              aria-label={CONTROLS.stillWaitTitle}
              onClick={() => toggle("wait")}
            >
              <Glyph name="fold" />
            </button>
          </div>
          {open.wait && (
            <ul class="sbody tight">
              {group.items.map((w) => (
                <li key={w.id} class="titem cw">
                  <span class="who">{pair(w)}</span>
                  <button class="act" type="button" title={stopWaitingTitle(w.onName)} onClick={() => cancelWatch(w.byAgent, w.id)}>
                    {CONTROLS.stopWaiting}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Fragment>
      ))}
      {firstTrig !== undefined && triggers.length === 1 && (
        <div class="srow one">
          <span class="mk">
            <Glyph name="clock" />
          </span>
          <span class="what">{trigSaid(firstTrig)}</span>
          {trigAction(firstTrig)}
        </div>
      )}
      {firstTrig !== undefined && triggers.length > 1 && (
        <>
          <button class="srow" type="button" aria-expanded={open.trig} onClick={() => toggle("trig")}>
            <span class="mk">
              <Glyph name="clock" />
            </span>
            <span class="what">{trigSaid(firstTrig)}</span>
            <span class="more">{moreCount(triggers.length - 1)}</span>
            <Glyph name="fold" />
          </button>
          {open.trig && (
            <ul class="sbody tight">
              {triggers.map((t) => (
                <li key={`${t.kind}\n${t.agent}\n${t.id}`} class={`titem ${manyAgents ? "c4" : "c3"} pg-${t.agentLook.pigment}`}>
                  <time>{t.kind === "once" ? t.when : t.on ? `next ${t.when}` : t.when}</time>
                  {manyAgents && <b>{t.agentName}</b>}
                  <span class="say">{t.kind === "once" ? t.say : `trigger ${t.id} · ${t.say}`}</span>
                  {trigAction(t)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {waitedBy.map((w) => (
        <div key={`${w.byAgent}\n${w.fromThread}`} class={`srow wrap pg-${w.byLook.pigment}`}>
          <span class="mk">
            <Glyph name="wait" />
          </span>
          <span class="what">
            <b class="on">
              <Sigil look={w.byLook} size="s12" />
              {w.byName}
            </b>
            {" waits on this from "}
            <button class="lk to" type="button" title={CONTROLS.waitsFromTitle} onClick={() => jump(w.byAgent, w.fromThread)}>
              {w.fromLabel}
            </button>
          </span>
        </div>
      ))}
    </section>
  );
}

interface ThreadProps {
  thread: ThreadLevel;
  /** The thread is in the person's DM with an agent. */
  dm: boolean;
  /** What is shown may be out of date: chat is not being reached. */
  stale: boolean;
  /** Where the agent's view of the thread is on show. */
  turned: boolean;
  retry: string | undefined;
  inFull: InFull;
  /** The agent whose work is open where several work. */
  work: string | undefined;
  stillOpen: StillOpen;
  composer: Omit<ComposerProps, "commands" | "busy" | "placeholder">;
  placeholder: string;
  /** The thread's menu is open, with renaming and archiving. */
  menu: boolean;
  /** The thread's name is an input where it stands. */
  naming: boolean;
  back: () => void;
  turn: () => void;
  toggleMenu: () => void;
  /** Turn the name into an input, or the input back into the name, renaming the thread to `typed` where it is given. */
  name: (naming: boolean, typed?: string) => void;
  /** Archive the thread, or bring it back. */
  archive: () => void;
  /** Join the room the thread is in, which the person only reads. */
  join: () => void;
  toggleFull: (which: keyof InFull) => void;
  toggleStill: (which: keyof StillOpen) => void;
  openWork: (agent: string) => void;
  jump: (agentId: string, threadId: string) => void;
  killProcess: (agentId: string, procId: string) => void;
  cancelWatch: (agentId: string, watchId: string) => void;
  cancelTrigger: (agentId: string, triggerId: string) => void;
  switchTrigger: (agentId: string, name: string, on: boolean) => void;
  stopWorking: () => void;
}

export function ThreadView(props: ThreadProps) {
  const { thread } = props;
  const open: AgentWork | undefined = thread.works.find((each) => each.agent === props.work) ?? thread.works[0];
  const pigment = thread.look?.pigment;
  const titles = `titles${pigment === undefined ? "" : ` pg-${pigment}`}`;
  const turn = thread.turnable || props.turned;
  // While the name is an input, it stands alone in the head.
  if (thread.nameable && props.naming) {
    return (
      <>
        <Head back={props.back}>
          <div class={titles}>
            <Naming who={thread.who} name={thread.name} called={thread.called} keep={(typed) => props.name(false, typed)} leave={() => props.name(false)} />
          </div>
        </Head>
        <ThreadBody {...props} open={open} />
      </>
    );
  }
  return (
    <>
      <Head
        back={props.back}
        acts={
          turn || thread.nameable ? (
            <>
              {turn && (
                <button class="btn turn" type="button" aria-pressed={props.turned} title={TURN_OVER} onClick={props.turn}>
                  <Glyph name="flip" />
                  <span>{CONTROLS.agentsView}</span>
                </button>
              )}
              {thread.nameable && (
                <button class="ib" type="button" aria-haspopup="menu" aria-expanded={props.menu} title={THREAD_MENU} aria-label={CONTROLS.threadMenu} onClick={props.toggleMenu}>
                  <Glyph name="more" />
                </button>
              )}
              {thread.nameable && props.menu && (
                <div class="menu stepbox" role="menu">
                  <button type="button" role="menuitem" onClick={() => props.name(true)}>
                    {CONTROLS.rename}
                  </button>
                  <button type="button" role="menuitem" onClick={props.archive}>
                    {thread.archived ? CONTROLS.unarchive : CONTROLS.archive}
                  </button>
                </div>
              )}
            </>
          ) : undefined
        }
      >
        <div class={titles}>
          <Title who={thread.who} rest={thread.called} stale={props.stale} tag={thread.tag} />
          {thread.sub.length > 0 && (
            <p class="sub">
              {thread.sub.map((part, at) => (
                <Fragment key={part}>
                  {at > 0 && <span class="dot">·</span>}
                  {part}
                </Fragment>
              ))}
            </p>
          )}
        </div>
      </Head>
      <ThreadBody {...props} open={open} />
    </>
  );
}

/** What the open thread says and what is going on in it, under its head: the conversation, each agent's work, the dock and the input. */
function ThreadBody(props: ThreadProps & { open: AgentWork | undefined }) {
  const { thread, dm, inFull, open } = props;
  return (
    <>
      <div class="body">
        <div class="scroll" data-follow="end">
          <div class="col">
            {thread.lead !== undefined && <p class="earlier">{thread.lead}</p>}
            {thread.messages.map((row, at) => {
              const before = thread.messages[at - 1];
              const cont = before?.kind === "message" && row.kind === "message" && before.who === row.who && before.when === row.when && !before.deleted && !row.firstNew;
              return <Message key={row.id} row={row} cont={cont} jump={props.jump} />;
            })}
            {thread.works.map((each) =>
              each === open ? (
                <WorkBlock key={each.agent} work={each} named={!dm || thread.works.length > 1} inFull={inFull} toggle={props.toggleFull} />
              ) : (
                <WorkRow key={each.agent} work={each} open={() => props.openWork(each.agent)} />
              ),
            )}
          </div>
        </div>
      </div>
      <footer class="dock">
        <div class="dock-col">
          <Notes notes={thread.notes} retry={props.retry} />
          {thread.status !== undefined && (
            <section class="statusblock stepbox">
              <h3>{thread.status.header}</h3>
              {thread.status.rows.map((row) => (
                <div key={row}>{row}</div>
              ))}
            </section>
          )}
          {thread.working !== undefined && (
            <p class="line working">
              <span class="walk">
                <i />
              </span>
              <span class="say">
                <Said text={thread.working} tag="kbd" />
              </span>
              {!thread.writable && !props.stale && thread.workingAgents.length > 0 && (
                <button class="act end" type="button" title={CONTROLS.stopTurn} onClick={props.stopWorking}>
                  {CONTROLS.stop}
                </button>
              )}
            </p>
          )}
          {thread.queued.map((line, at) => (
            <p key={`${String(at)} ${line}`} class="line queued">
              <span>{line}</span>
            </p>
          ))}
          {!props.stale && (
            <Still
              still={thread.still}
              open={props.stillOpen}
              toggle={props.toggleStill}
              jump={props.jump}
              killProcess={props.killProcess}
              cancelWatch={props.cancelWatch}
              cancelTrigger={props.cancelTrigger}
              switchTrigger={props.switchTrigger}
            />
          )}
          {thread.writable ? (
            <Composer {...props.composer} commands={thread.commands} busy={thread.working !== undefined} placeholder={props.placeholder} />
          ) : (
            thread.readOnly !== undefined && (
              <p class="readonly stepbox">
                <Glyph name="eye" />
                <span>
                  <Said text={thread.readOnly} tag="code" />
                </span>
                {thread.joinable && (
                  <button class="btn" type="button" onClick={props.join}>
                    {CONTROLS.join}
                  </button>
                )}
              </p>
            )
          )}
        </div>
      </footer>
    </>
  );
}

/** The thread's pane with nothing open in it and no agent's page to show: the wordmark pressed into it, and what to do. */
export function Empty({ words }: { words: string }) {
  return (
    <div class="empty">
      <Relief sigil={undefined} />
      <p>{words}</p>
    </div>
  );
}
