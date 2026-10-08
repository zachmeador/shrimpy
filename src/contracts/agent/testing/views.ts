import type { SessionItem, SessionStatus, SessionView, ToolStatus } from "../index.ts";

/** A session view as a test writes it down: idle and empty, with whatever `parts` says. */
export function sessionView(parts: { items?: SessionItem[]; status?: Partial<SessionStatus> } = {}): SessionView {
  const items = parts.items ?? [];
  return {
    items,
    status: {
      activity: { kind: "idle" },
      busy: false,
      queued: [],
      model: { provider: "local", id: "test-model" },
      ownModel: false,
      usage: { input: 0, output: 0, cost: 0 },
      ...parts.status,
    },
    entries: items.length,
  };
}

/** A session view of a turn being worked on: busy, with the activity a client would be told. */
export function workingView(items: SessionItem[], activity: SessionStatus["activity"] = { kind: "working" }): SessionView {
  return sessionView({ items, status: { busy: true, activity } });
}

export const userItem = (text: string): SessionItem => ({ type: "user", text });

export function assistantItem(
  text: string,
  options: { thinking?: string; streaming?: boolean; stopReason?: string | null } = {},
): SessionItem {
  const { thinking = "", streaming = false, stopReason = streaming ? null : "stop" } = options;
  return { type: "assistant", text, thinking, streaming, stopReason };
}

export function toolItem(
  name: string,
  options: { id?: string; args?: object; status?: ToolStatus; output?: string; notes?: string[] } = {},
): SessionItem {
  const { id = `call_${name}`, args = {}, status = "running", output = "", notes = [] } = options;
  return { type: "tool", id, name, args: JSON.stringify(args), status, output, notes };
}
