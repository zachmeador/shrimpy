import { lookFromId, parseSigil, type Pigment, PIGMENTS } from "../../contracts/agent/index.ts";
import type { Model } from "../state/index.ts";

/** How an agent is drawn: its sigil, twelve lines of twelve, `#` for on and `.` for off, and the pigment it is drawn in. */
export interface Look {
  sigil: string[];
  pigment: Pigment;
}

/** The look worked out from each member ID asked for, which never changes. */
const fromIds = new Map<string, Look>();

const fromId = (id: string): Look => {
  let look = fromIds.get(id);
  if (look === undefined) {
    look = lookFromId(id);
    fromIds.set(id, look);
  }
  return look;
};

/**
 * How the agent with member ID `id` looks: its sigil and its pigment as its
 * Agent object shows them while it runs, and where that shows none, or shows
 * what is no sigil or no pigment, or the agent isn't running, the one that
 * `lookFromId` works out from its member ID.
 */
export function lookOf(model: Pick<Model, "listing" | "looks">, id: string): Look {
  const running = model.listing?.programs.some((program) => program.kind === "agent" && program.member === id) ?? false;
  const shown = running ? model.looks[id] : undefined;
  const sigil = shown?.sigil === null || shown?.sigil === undefined ? undefined : parseSigil(shown.sigil.join("\n"));
  const pigment = PIGMENTS.find((each) => each === shown?.pigment);
  return { sigil: sigil ?? fromId(id).sigil, pigment: pigment ?? fromId(id).pigment };
}
