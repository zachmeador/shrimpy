import type { SessionItem, SessionView } from "../../contracts/agent/index.ts";

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
