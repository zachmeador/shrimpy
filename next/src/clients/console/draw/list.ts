import { SelectList } from "@earendil-works/pi-tui";
import type { Row } from "../screen/index.ts";
import type { Theme } from "./theme.ts";

export interface ListOptions {
  rows: Row[];
  /** The row that was chosen before, kept chosen when the rows change. */
  chosen: string | undefined;
  /** How many rows show at once. */
  room: number;
  theme: Theme;
  /** The person opened a row. */
  open(id: string): void;
  /** The person moved to a row. */
  moved(id: string): void;
}

/**
 * A list of agents or threads to choose from, with the choice kept across the
 * list being drawn again. The list is handed each row's position, never its ID
 * or its text as a value, so what a row says is only what the screen made of it.
 */
export function listOf(options: ListOptions): SelectList {
  const list = new SelectList(
    options.rows.map((row, index) => ({ value: String(index), label: row.label, description: row.detail })),
    Math.max(3, options.room),
    options.theme.select,
    { minPrimaryColumnWidth: 24, maxPrimaryColumnWidth: 48 },
  );
  const idAt = (value: string): string | undefined => options.rows[Number(value)]?.id;
  const kept = options.rows.findIndex((row) => row.id === options.chosen);
  list.setSelectedIndex(Math.max(0, kept));
  list.onSelect = (item) => {
    const id = idAt(item.value);
    if (id !== undefined) options.open(id);
  };
  list.onSelectionChange = (item) => {
    const id = idAt(item.value);
    if (id !== undefined) options.moved(id);
  };
  return list;
}
