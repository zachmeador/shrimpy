/*
 * The agent's view: the session behind the open thread as the agent sees it,
 * beside the conversation at a desk, and in its place on a phone. It is for
 * watching: the thread's own input stays with the conversation.
 */
import type { SessionLevel } from "../view/index.ts";
import { Glyph } from "./marks.tsx";
import { SessionFoot, Title } from "./thread.tsx";
import { Steps } from "./work.tsx";
import { CONTROLS } from "./words.ts";

export function WatchView({ session, close, retry }: { session: SessionLevel; close: () => void; retry: string | undefined }) {
  return (
    <>
      <header class={`head pg-${session.look.pigment}`}>
        <button class="ib only-narrow" type="button" aria-label={CONTROLS.backToConversation} onClick={close}>
          <Glyph name="back" />
        </button>
        <div class="titles">
          <Title who={session.who} rest={session.watching} stale={session.stale} />
        </div>
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
      <SessionFoot session={session} retry={retry} />
    </>
  );
}
