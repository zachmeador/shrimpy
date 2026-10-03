import type { SessionHandle, SessionItem, SessionView } from "../../contracts/agent/index.ts";

/** Resolve with the first view that satisfies `done`. */
export function waitForView(
  session: SessionHandle,
  done: (view: SessionView) => boolean,
): Promise<SessionView> {
  return new Promise((resolve) => {
    // The listener can fire during subscribe(), before there is anything to stop.
    const watch: { finished: boolean; stop?: () => void } = { finished: false };
    watch.stop = session.subscribe((view) => {
      if (watch.finished || !done(view)) return;
      watch.finished = true;
      watch.stop?.();
      resolve(view);
    });
    if (watch.finished) watch.stop();
  });
}

/** The session has answered: it is idle and its last item is a finished answer. */
export function answered(view: SessionView): boolean {
  const last = view.items.at(-1);
  return !view.status.busy && last?.type === "assistant" && last.stopReason === "stop";
}

export function assistantItems(view: SessionView): Extract<SessionItem, { type: "assistant" }>[] {
  return view.items.filter((item) => item.type === "assistant");
}

export function toolItems(view: SessionView): Extract<SessionItem, { type: "tool" }>[] {
  return view.items.filter((item) => item.type === "tool");
}
