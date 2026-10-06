import { type Component, Container, Markdown, Text, truncateToWidth, TruncatedText } from "@earendil-works/pi-tui";
import { hiddenLines, OUT_OF_DATE, type Step, type Work } from "../screen/index.ts";
import type { Theme } from "./theme.ts";

/**
 * The work in progress behind the open thread, drawn apart from what was said:
 * a bar down its left side, and no more lines than `room` allows, the latest
 * ones, so that what changes always stays on the screen the person is looking at.
 */
export function workComponent(work: Work, stale: boolean, theme: Theme, room: () => number): Component {
  const content = new Container();
  if (stale) content.addChild(new Text(theme.warn(`(${OUT_OF_DATE})`), 0, 0));
  if (work.earlier !== undefined) content.addChild(new Text(theme.dim(work.earlier), 0, 0));
  for (const step of work.steps) content.addChild(stepComponent(step, theme));

  const bar = `${theme.bar("│")} `;
  return {
    render(width) {
      const lines = content.render(Math.max(1, width - 2));
      const most = Math.max(3, room());
      const shown =
        lines.length > most ? [theme.dim(hiddenLines(lines.length - most + 1)), ...lines.slice(lines.length - most + 1)] : lines;
      // A line wider than the terminal ends the drawing, so every line here is cut to fit, even those made here.
      return shown.map((line) => truncateToWidth(bar + line, width, ""));
    },
    invalidate() {
      content.invalidate();
    },
  };
}

function stepComponent(step: Step, theme: Theme): Component {
  const view = new Container();
  switch (step.kind) {
    case "thinking":
      if (step.earlier !== undefined) view.addChild(new Text(theme.dim(`… ${step.earlier}`), 0, 0));
      view.addChild(new Text(theme.thinking(`${step.label}: ${step.text}`), 0, 0));
      break;
    case "text":
      if (step.text !== "") view.addChild(new Markdown(step.text, 0, 0, theme.markdown));
      if (step.note !== undefined) view.addChild(new Text(theme.dim(`(${step.note})`), 0, 0));
      break;
    case "tool": {
      // A call shown whole may take many lines, so it goes under the line that says how the call stands.
      const inline = step.whole || step.call === "" ? "" : ` ${theme.dim(step.call)}`;
      view.addChild(new TruncatedText(`${theme.tone[step.tone](step.status)}  ${theme.bold(step.name)}${inline}`, 0, 0));
      if (step.whole && step.call !== "") view.addChild(new Text(step.call, 2, 0));
      if (step.earlier !== undefined) view.addChild(new Text(theme.dim(`… ${step.earlier}`), 2, 0));
      if (step.output.length > 0) view.addChild(new Text(theme.dim(step.output.join("\n")), 2, 0));
      for (const note of step.notes) view.addChild(new Text(theme.dim(`· ${note}`), 2, 0));
      break;
    }
  }
  return view;
}
