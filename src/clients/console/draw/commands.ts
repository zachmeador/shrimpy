import type { AutocompleteProvider } from "@earendil-works/pi-tui";
import type { CommandLine } from "../screen/index.ts";

/** What is before the cursor on the first line, when that is a slash and nothing after it but the word the cursor is at the end of. */
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
 * next Enter acts on it.
 */
export function commandList(commands: () => CommandLine[]): AutocompleteProvider {
  const wordBefore = (lines: string[], cursorLine: number, cursorCol: number): string | undefined =>
    cursorLine === 0 ? COMMAND_WORD.exec((lines[0] ?? "").slice(0, cursorCol))?.[1] : undefined;

  return {
    getSuggestions(lines, cursorLine, cursorCol) {
      const typed = wordBefore(lines, cursorLine, cursorCol);
      if (typed === undefined) return Promise.resolve(null);
      const start = typed.toLowerCase();
      const matches = commands().filter((command) => command.name.startsWith(start));
      if (matches.length === 0 || (matches.length === 1 && matches[0]?.name === start)) return Promise.resolve(null);
      return Promise.resolve({
        prefix: typed,
        items: matches.map((command) => ({ value: command.name, label: command.name, description: command.line })),
      });
    },
    // The editor hands back what was typed when it made the list, and keys that arrive together can change the text before the list is made again, so what is there now decides.
    applyCompletion(lines, cursorLine, cursorCol, item) {
      const typed = wordBefore(lines, cursorLine, cursorCol);
      if (typed === undefined || !item.value.startsWith(typed.toLowerCase())) return { lines, cursorLine, cursorCol };
      const line = lines[cursorLine] ?? "";
      const start = cursorCol - typed.length;
      return {
        lines: lines.map((each, index) => (index === cursorLine ? `${line.slice(0, start)}${item.value}${line.slice(cursorCol)}` : each)),
        cursorLine,
        cursorCol: start + item.value.length,
      };
    },
  };
}
