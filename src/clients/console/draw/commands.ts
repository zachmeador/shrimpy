import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import type { CommandLine } from "../screen/index.ts";

/** The word the cursor is at the end of, when what comes before it on the first line is a slash and nothing else but that word. */
const COMMAND_WORD = /^\s*(\/\S*)$/;

/**
 * What the editor lists while the text starts with a slash and the cursor is
 * still in its first word: the commands that word could become, each with what
 * it does, and nothing else. The editor's own provider also completes paths on
 * the machine the terminal runs on, which is not where an agent lives.
 * `commands` is asked each time, since which commands there are, and what they
 * do, depends on where the person is writing.
 *
 * A name that is typed whole leaves nothing to choose, so the list closes and the
 * next Enter sends it.
 */
export function commandList(commands: () => CommandLine[]): AutocompleteProvider {
  return {
    getSuggestions(lines, cursorLine, cursorCol) {
      const before = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const typed = cursorLine === 0 ? COMMAND_WORD.exec(before)?.[1] : undefined;
      if (typed === undefined) return Promise.resolve(null);
      const start = typed.toLowerCase();
      const matches = commands().filter((command) => command.name.startsWith(start));
      if (matches.length === 0 || (matches.length === 1 && matches[0]?.name === start)) return Promise.resolve(null);
      return Promise.resolve({
        prefix: typed,
        items: matches.map((command) => ({ value: command.name, label: command.name, description: command.line })),
      });
    },
    applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
      const line = lines[cursorLine] ?? "";
      const start = cursorCol - prefix.length;
      return {
        lines: lines.map((each, index) => (index === cursorLine ? `${line.slice(0, start)}${item.value}${line.slice(cursorCol)}` : each)),
        cursorLine,
        cursorCol: start + item.value.length,
      };
    },
  };
}
