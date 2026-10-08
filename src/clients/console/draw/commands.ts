import { type AutocompleteItem, type AutocompleteProvider, visibleWidth } from "@earendil-works/pi-tui";
import { type CommandLine, MODEL_DEFAULT, type ModelLine } from "../screen/index.ts";

/** What is before the cursor on the first line, when that is a slash and nothing after it but the word the cursor is at the end of. */
const COMMAND_WORD = /^\s*(\/\S*)$/;

/** The command that a model is written after. */
const MODEL_COMMAND = "/model";

/** What is before the cursor on the first line, when that is `/model`, a space, and what has been typed of the model so far. */
const MODEL_WORD = /^\s*\/model\s+(\S*)$/i;

/** An item that offers a model, as no item of the list of commands does. */
interface ModelItem extends AutocompleteItem {
  model: true;
}
const isModel = (item: AutocompleteItem): item is ModelItem => "model" in item;

export interface CommandListOptions {
  /** The commands that can be written where the person is. Asked each time, since which there are depends on where they are writing. */
  commands: () => CommandLine[];
  /** What `/model ` offers: `default` and the models the agent can use. Undefined when there are none to offer. Asked each time the list needs them. */
  models: () => Promise<ModelLine[] | undefined>;
}

/** The text of the first line before the cursor, if the cursor is on the first line, which is the only one a command is written in. */
const firstLineBefore = (lines: string[], cursorLine: number, cursorCol: number): string | undefined =>
  cursorLine === 0 ? (lines[0] ?? "").slice(0, cursorCol) : undefined;

/**
 * Whether the model written as `value` is one that `typed` could become.
 * `default` is only written out, and a model is found by any part of its name.
 */
const fits = (value: string, typed: string): boolean => {
  const written = value.toLowerCase();
  const start = typed.toLowerCase();
  return value === MODEL_DEFAULT ? written.startsWith(start) : written.includes(start);
};

/** The models, as items of one column: the list cuts a first column at 30 characters, and a model is written longer than that. */
function modelItems(lines: ModelLine[]): ModelItem[] {
  const widest = Math.max(...lines.map((each) => visibleWidth(each.value)));
  return lines.map((each) => ({
    value: each.value,
    label: `${each.value}${" ".repeat(widest - visibleWidth(each.value) + 2)}${each.line}`,
    model: true,
  }));
}

/**
 * What the editor lists while the text starts with a slash and the cursor is
 * still in its first word: the commands that word could become, each with what
 * it does, and nothing else. Once `/model` and a space are typed it lists
 * `default` and the models the agent can use, narrowed by what is typed after
 * them. The editor's own provider also completes paths on the machine the
 * terminal runs on, which is not where an agent lives.
 *
 * A name that is typed whole leaves nothing to choose, so the list closes and the
 * next Enter acts on it. `/model` is the exception, since a model comes after it
 * and the space has to find the list open.
 */
export function commandList(options: CommandListOptions): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol) {
      const before = firstLineBefore(lines, cursorLine, cursorCol);
      if (before === undefined) return null;

      const word = COMMAND_WORD.exec(before)?.[1];
      if (word !== undefined) {
        const start = word.toLowerCase();
        const matches = options.commands().filter((command) => command.name.startsWith(start));
        const whole = matches.length === 1 && matches[0]?.name === start && start !== MODEL_COMMAND;
        if (matches.length === 0 || whole) return null;
        return {
          prefix: word,
          items: matches.map((command) => ({ value: command.name, label: command.name, description: command.line })),
        };
      }

      const typed = MODEL_WORD.exec(before)?.[1];
      if (typed === undefined || !options.commands().some((command) => command.name === MODEL_COMMAND)) return null;
      const offered = await options.models();
      if (offered === undefined) return null;
      const start = typed.toLowerCase();
      const begins = (each: ModelLine): boolean => each.value.toLowerCase().startsWith(start);
      // `default` comes first, then the models the typing starts, then those it is found in.
      const fitting = offered.filter((each) => fits(each.value, typed)).sort((a, b) => Number(begins(b)) - Number(begins(a)));
      if (fitting.length === 0 || (fitting.length === 1 && fitting[0]?.value === typed)) return null;
      // Enter acts on the chosen item only when the prefix starts with a slash, as the prefix of a command does.
      return { prefix: before.trimStart(), items: modelItems(fitting) };
    },
    // The editor hands back what was typed when it made the list, and keys that arrive together can change the text before the list is made again, so what is there now decides.
    applyCompletion(lines, cursorLine, cursorCol, item) {
      const unchanged = { lines, cursorLine, cursorCol };
      const before = firstLineBefore(lines, cursorLine, cursorCol);
      if (before === undefined) return unchanged;
      const model = isModel(item);
      const typed = (model ? MODEL_WORD : COMMAND_WORD).exec(before)?.[1];
      if (typed === undefined || !(model ? fits(item.value, typed) : item.value.startsWith(typed.toLowerCase()))) return unchanged;
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
