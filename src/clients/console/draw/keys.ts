import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { Theme } from "./theme.ts";

const SEPARATOR = " · ";

/**
 * The line of keys at the bottom of a screen: as many hints to a line as fit,
 * and none cut in two where the line ends.
 */
export function keysComponent(hints: string[], theme: Theme): Component {
  return {
    render(width) {
      const lines: string[] = [];
      let line = "";
      for (const hint of hints) {
        const joined = line === "" ? hint : `${line}${SEPARATOR}${hint}`;
        if (line !== "" && visibleWidth(joined) > width) {
          lines.push(line);
          line = hint;
        } else {
          line = joined;
        }
      }
      if (line !== "") lines.push(line);
      return lines.map((each) => theme.dim(truncateToWidth(each, width, "")));
    },
    invalidate() {},
  };
}
