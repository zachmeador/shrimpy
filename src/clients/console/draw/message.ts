import { type Component, Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import type { MessageRow } from "../screen/index.ts";
import type { Theme } from "./theme.ts";

/**
 * A message of the thread as it now stands: who said it and when, marked if it
 * was edited, what they said or that it was deleted, the emoji on it, and under
 * it what an agent did with it where that is worth saying. An agent's words are
 * markdown; other people's are drawn as they typed them.
 */
export function messageComponent(row: MessageRow, theme: Theme): Component {
  const view = new Container();
  const name = row.mine ? theme.me : row.agent ? theme.agent : theme.other;
  const edited = row.edited === undefined ? "" : `  ${theme.dim(row.edited)}`;
  view.addChild(new Spacer(1));
  view.addChild(new Text(`${name(row.who)}  ${theme.dim(row.when)}${edited}`, 0, 0));
  if (row.deleted) view.addChild(new Text(theme.dim(row.text), 2, 0));
  else if (row.text !== "") view.addChild(row.agent ? new Markdown(row.text, 2, 0, theme.markdown) : new Text(row.text, 2, 0));
  if (row.reactions !== undefined) view.addChild(new Text(theme.dim(row.reactions), 2, 0));
  for (const note of row.notes) view.addChild(new Text(theme.warn(`-- ${note} --`), 2, 0));
  return view;
}
