import type { AnswerEnding, SessionImage, SessionItem, SessionStatus, ToolStatus } from "../index.ts";

/** A session's status as a test writes it down: idle, with whatever `parts` says. */
export function sessionStatus(parts: Partial<SessionStatus> = {}): SessionStatus {
  return {
    activity: { kind: "idle" },
    busy: false,
    queued: [],
    model: { provider: "local", id: "test-model" },
    ownModel: false,
    usage: { input: 0, output: 0, cost: 0 },
    wakeups: [],
    failure: null,
    ...parts,
  };
}

export const userItem = (text: string, entry: number | null = null, images: SessionImage[] = []): SessionItem => ({
  type: "user",
  entry,
  text,
  images,
});

/** An answer, finished unless it streams or `ended` says otherwise. */
export function assistantItem(
  text: string,
  options: { thinking?: string; streaming?: boolean; ended?: AnswerEnding; entry?: number | null } = {},
): SessionItem {
  const { thinking = "", streaming = false, ended = "finished", entry = null } = options;
  return { type: "assistant", entry, text, thinking, streaming, ended: streaming ? null : { how: ended, detail: null } };
}

export function toolItem(
  name: string,
  options: {
    id?: string;
    args?: object;
    status?: ToolStatus;
    output?: string;
    images?: SessionImage[];
    notes?: string[];
    entry?: number | null;
  } = {},
): SessionItem {
  const { id = `call_${name}`, args = {}, status = "running", output = "", images = [], notes = [], entry = null } = options;
  return { type: "tool", entry, id, name, args: JSON.stringify(args), status, output, images, notes };
}
