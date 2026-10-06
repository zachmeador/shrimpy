import { type Component, Spacer, Text } from "@earendil-works/pi-tui";
import type { SessionScreen, Step } from "../screen/index.ts";
import type { Theme } from "./theme.ts";
import { stepComponent } from "./work.ts";

/** What stands apart from what is around it: what the session was shown, and where it was reset or compacted. */
const standsApart = (step: Step): boolean => step.kind === "shown" || step.kind === "marker";

/**
 * What a session being watched holds, newest at the bottom: what it was shown,
 * and what it thought, wrote and did, with a blank line around what was shown
 * so that a turn reads as one run. The line saying what it is doing now is the
 * drawing's, since it moves.
 */
export function sessionComponents(screen: SessionScreen, theme: Theme): Component[] {
  const parts: Component[] = [];
  if (screen.lead !== undefined) parts.push(new Text(theme.dim(screen.lead), 0, 1));
  else if (screen.steps.length > 0) parts.push(new Spacer(1));
  let before: Step | undefined;
  for (const step of screen.steps) {
    if (before !== undefined && (standsApart(before) || standsApart(step))) parts.push(new Spacer(1));
    parts.push(stepComponent(step, theme));
    before = step;
  }
  return parts;
}
