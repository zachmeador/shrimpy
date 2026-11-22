/*
 * The agent's view: the session behind the open thread as the agent sees it,
 * beside the conversation at a desk, and in its place on a phone. It is for
 * watching: the thread's own input stays with the conversation.
 */
import type { SessionLevel } from "../view/index.ts";
import { Glyph, Sigil } from "./marks.tsx";
import { Notes, Title } from "./thread.tsx";
import { Steps } from "./work.tsx";
import { CONTROLS } from "./words.ts";

interface WatchProps {
  session: SessionLevel;
  close: () => void;
  /** Put the view of the agent with this member ID on show. */
  show: (agent: string) => void;
  retry: string | undefined;
}

export function WatchView({ session, close, show, retry }: WatchProps) {
  return (
    <>
      <header class={`head pg-${session.look.pigment}`}>
        <button class="ib only-narrow" type="button" aria-label={CONTROLS.backToConversation} onClick={close}>
          <Glyph name="back" />
        </button>
        <div class="titles">
          <Title who={session.who} rest={session.watching} stale={session.stale} />
        </div>
        {session.sides.length > 1 && (
          <div class="picker" role="group" aria-label={CONTROLS.whoseView}>
            {session.sides.map((side) => (
              <button key={side.agent} type="button" aria-pressed={side.agent === session.agent} title={side.name} onClick={() => show(side.agent)}>
                <Sigil look={side.look} />
              </button>
            ))}
          </div>
        )}
        <button class="ib only-wide" type="button" aria-label={CONTROLS.closeView} title={CONTROLS.closeView} onClick={close}>
          <Glyph name="close" />
        </button>
      </header>
      <div class="body">
        <div class="scroll" data-follow="end">
          <div class="col">
            {session.lead !== undefined && <p class="earlier">{session.lead}</p>}
            <Steps steps={session.steps} />
          </div>
        </div>
      </div>
      <footer class="watch-foot">
        <Notes notes={session.notes} retry={retry} />
        {session.foot}
      </footer>
    </>
  );
}
