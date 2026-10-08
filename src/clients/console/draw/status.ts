import { type Component, Container, Spacer, Text } from "@earendil-works/pi-tui";
import type { StatusBlock } from "../screen/index.ts";
import type { Theme } from "./theme.ts";

/**
 * What `/status` read, apart from what was said: a line saying it is for the
 * person alone and when it was read, and a line under it for each thing found.
 */
export function statusComponent(block: StatusBlock, theme: Theme): Component {
  const view = new Container();
  view.addChild(new Spacer(1));
  view.addChild(new Text(theme.dim(block.header), 0, 0));
  for (const row of block.rows) view.addChild(new Text(row, 2, 0));
  return view;
}
