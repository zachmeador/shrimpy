/*
 * The third level: the open thread, with the work of each agent in it, what
 * is happening now and the input; or a session behind no thread, watched; or,
 * with nothing open, a shape pressed into the pane and what to do.
 */
import type { ComponentChildren } from "preact";
import type { AgentWork, InFull, MessageRow, SessionLevel, ThreadLevel, Waiting } from "../view/index.ts";
import { CHECKING_BACK, moreWakeups, OUT_OF_DATE_MARK } from "../view/index.ts";
import { Composer, type ComposerProps } from "./composer.tsx";
import { Glyph, Relief, Sigil } from "./marks.tsx";
import { Plain, Prose } from "./prose.tsx";
import { Steps, WorkBlock, WorkRow } from "./work.tsx";
import { CONTROLS, TURN_OVER } from "./words.ts";

/** A note on what is not working, the first with when the page tries again, where it does. */
export function Notes({ notes, retry }: { notes: string[]; retry: string | undefined }) {
  return (
    <>
      {notes.map((note, at) => (
        <p key={note} class="note stepbox">
          {note}
          {at === 0 && retry !== undefined && <span class="retry">{retry}</span>}
        </p>
      ))}
    </>
  );
}

/** The head of the third level: the way back on a narrow page, what is open, and what can be done with it. */
export function Head({ back, children, acts }: { back: () => void; children: ComponentChildren; acts?: ComponentChildren }) {
  return (
    <header class="head thead">
      <button class="ib only-narrow" type="button" aria-label={CONTROLS.back} onClick={back}>
        <Glyph name="back" />
      </button>
      {children}
      {acts !== undefined && <div class="acts">{acts}</div>}
    </header>
  );
}

/** What is open, as a head names it: who it is with, set apart, then what it is, and whether it may be out of date. */
export function Title({ who, rest, stale, path }: { who: string; rest: string; stale: boolean; path?: boolean }) {
  return (
    <h1>
      <b class="who">{who}</b>
      <span class="dot">·</span>
      <span class={path === true ? "rest path" : "rest"}>{rest}</span>
      {stale && <span class="stale-tag">{OUT_OF_DATE_MARK}</span>}
    </h1>
  );
}

function Message({ row, cont }: { row: MessageRow; cont: boolean }) {
  return (
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
        {row.deleted ? <p class="deleted">{row.text}</p> : row.agent ? <Prose text={row.text} breaks /> : <Plain text={row.text} />}
        {row.reactions !== undefined && (
          <div class="reactions">
            <span class="react">{row.reactions}</span>
          </div>
        )}
        {row.notes.map((note) => (
          <p key={note} class="receipt">
            <Glyph name="bang" />
            {note}
          </p>
        ))}
      </div>
    </article>
  );
}

/** The wake-ups waiting in a thread: the soonest on a line with a count of the rest, which open in place. */
function Later({ waiting, open, toggle }: { waiting: Waiting[]; open: boolean; toggle: () => void }) {
  const [first] = waiting;
  if (first === undefined) return null;
  if (waiting.length === 1) {
    return (
      <p class="line wake">
        <Glyph name="clock" />
        <span>{first.line}</span>
      </p>
    );
  }
  if (!open) {
    return (
      <p class="line wake later">
        <Glyph name="clock" />
        <span>{first.line}</span>
        <button class="lk more" type="button" aria-expanded="false" onClick={toggle}>
          {moreWakeups(waiting.length - 1)}
        </button>
      </p>
    );
  }
  return (
    <ol class="wakes stepbox">
      <li class="top">
        <span>{CHECKING_BACK}</span>
        <button class="lk" type="button" aria-expanded="true" onClick={toggle}>
          {CONTROLS.hide}
        </button>
      </li>
      {waiting.map((each) => (
        <li key={each.line} class={`pg-${each.look.pigment}`}>
          <Sigil look={each.look} size="s12" />
          <span>{each.line}</span>
        </li>
      ))}
    </ol>
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
  later: boolean;
  composer: Omit<ComposerProps, "commands" | "busy" | "placeholder">;
  placeholder: string;
  back: () => void;
  turn: () => void;
  toggleFull: (which: keyof InFull) => void;
  toggleLater: () => void;
  openWork: (agent: string) => void;
}

export function ThreadView(props: ThreadProps) {
  const { thread, dm, inFull } = props;
  const open: AgentWork | undefined = thread.works.find((each) => each.agent === props.work) ?? thread.works[0];
  const pigment = thread.works.find((each) => each.agent === thread.from)?.look.pigment;
  return (
    <>
      <Head
        back={props.back}
        acts={
          thread.turnable || props.turned ? (
            <button class="btn turn" type="button" aria-pressed={props.turned} title={TURN_OVER} onClick={props.turn}>
              <Glyph name="flip" />
              <span>{CONTROLS.agentsView}</span>
            </button>
          ) : undefined
        }
      >
        <div class={`titles${pigment === undefined ? "" : ` pg-${pigment}`}`}>
          <Title who={thread.who} rest={thread.called} stale={props.stale} />
        </div>
      </Head>
      <div class="body">
        <div class="scroll" data-follow="end">
          <div class="col">
            {thread.lead !== undefined && <p class="earlier">{thread.lead}</p>}
            {thread.messages.map((row, at) => {
              const before = thread.messages[at - 1];
              return <Message key={row.id} row={row} cont={before !== undefined && before.who === row.who && before.when === row.when && !before.deleted} />;
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
              <span>{thread.working}</span>
            </p>
          )}
          {thread.queued.map((line, at) => (
            <p key={`${String(at)} ${line}`} class="line queued">
              <span>{line}</span>
            </p>
          ))}
          <Later waiting={thread.waiting} open={props.later} toggle={props.toggleLater} />
          {thread.writable ? (
            <Composer {...props.composer} commands={thread.commands} busy={thread.working !== undefined} placeholder={props.placeholder} />
          ) : (
            thread.readOnly !== undefined && (
              <p class="readonly stepbox">
                <Glyph name="eye" />
                <span>{thread.readOnly}</span>
              </p>
            )
          )}
        </div>
      </footer>
    </>
  );
}

/** A session on show in the thread's place: a trigger's own, which is behind no thread, watched. */
export function SessionView({ session, back, retry }: { session: SessionLevel; back: () => void; retry: string | undefined }) {
  return (
    <>
      <Head back={back}>
        <div class={`titles pg-${session.look.pigment}`}>
          <Title who={session.who} rest={session.watching} stale={session.stale} />
        </div>
      </Head>
      <div class="body">
        <div class="scroll" data-follow="end">
          <div class="col session">
            {session.lead !== undefined && <p class="earlier">{session.lead}</p>}
            <Steps steps={session.steps} />
          </div>
        </div>
      </div>
      <SessionFoot session={session} retry={retry} />
    </>
  );
}

/** What a watched session is doing now, or that it is idle, and what waits for it. */
export function SessionFoot({ session, retry }: { session: SessionLevel; retry: string | undefined }) {
  const lines = [session.working ?? session.idle, ...session.queued, ...session.waiting].filter((line) => line !== undefined);
  return (
    <footer class="watch-foot">
      <Notes notes={session.notes} retry={retry} />
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </footer>
  );
}

/** The thread's pane with nothing open in it: a shape pressed into it, and what to do. */
export function Empty({ sigil, words }: { sigil: readonly string[] | undefined; words: string }) {
  return (
    <div class="empty">
      <Relief sigil={sigil} />
      <p>{words}</p>
    </div>
  );
}

