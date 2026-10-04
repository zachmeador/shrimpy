import { type Component, Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { MessageRow } from "../screen/index.ts";
import type { Theme } from "./theme.ts";

/**
 * A message of the thread: who said it and when, what they said, and under it
 * what an agent did with it where that is worth saying. An agent's words are
 * markdown; other people's are drawn as they typed them.
 */
export function messageComponent(row: MessageRow, theme: Theme): Component {
  const view = new Container();
  const name = row.mine ? theme.me : row.agent ? theme.agent : theme.other;
  view.addChild(new Spacer(1));
  view.addChild(new Text(`${name(row.who)}  ${theme.dim(row.when)}`, 0, 0));
  if (row.text !== "") view.addChild(row.agent ? new Markdown(row.text, 2, 0, theme.markdown) : new Text(row.text, 2, 0));
  for (const note of row.notes) view.addChild(new Text(theme.warn(`-- ${note} --`), 2, 0));
  return view;
}
