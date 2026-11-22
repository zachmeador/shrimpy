import { type AutocompleteItem, type AutocompleteProvider, visibleWidth } from "@earendil-works/pi-tui";
import {
  type CommandLine,
  commandFits,
  commandsFitting,
  commandWord,
  modelFits,
  type ModelLine,
  modelsFitting,
  modelWord,
  offersModels,
} from "../../view/index.ts";

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
 * The editor's list, while the text starts with a slash and the cursor is
 * still in its first word: the commands that word could become, each with what
 * it does, and once `/model` and a space are typed, `default` and the models
 * the agent can use, as the views say which fit what is typed. The editor's
 * own provider also completes paths on the machine the terminal runs on, which
 * is not where an agent lives.
 */
export function commandList(options: CommandListOptions): AutocompleteProvider {
  return {
    async getSuggestions(lines, cursorLine, cursorCol) {
      const before = firstLineBefore(lines, cursorLine, cursorCol);
      if (before === undefined) return null;

      const word = commandWord(before);
      if (word !== undefined) {
        const matches = commandsFitting(word, options.commands());
        if (matches.length === 0) return null;
        return { prefix: word, items: matches.map((command) => ({ value: command.name, label: command.name, description: command.line })) };
      }

      const typed = modelWord(before);
      if (typed === undefined || !offersModels(options.commands())) return null;
      const offered = await options.models();
      const fitting = offered === undefined ? [] : modelsFitting(typed, offered);
      if (fitting.length === 0) return null;
      // Enter acts on the chosen item only when the prefix starts with a slash, as the prefix of a command does.
      return { prefix: before.trimStart(), items: modelItems(fitting) };
    },
    // The editor hands back what was typed when it made the list, and keys that arrive together can change the text before the list is made again, so what is there now decides.
    applyCompletion(lines, cursorLine, cursorCol, item) {
      const unchanged = { lines, cursorLine, cursorCol };
      const before = firstLineBefore(lines, cursorLine, cursorCol);
      if (before === undefined) return unchanged;
      const model = isModel(item);
      const typed = model ? modelWord(before) : commandWord(before);
      if (typed === undefined || !(model ? modelFits(item.value, typed) : commandFits(item.value, typed))) return unchanged;
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
