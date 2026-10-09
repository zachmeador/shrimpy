import { SelectList } from "@earendil-works/pi-tui";
import type { Row } from "../screen/index.ts";
import type { Theme } from "./theme.ts";

export interface ListOptions {
  rows: Row[];
  /** The key of the row that was chosen before, as `moved` was told it, kept chosen when the rows change. */
  chosen: string | undefined;
  /** How many rows show at once. */
  room: number;
  theme: Theme;
  /** The person opened a row. */
  open(row: Row): void;
  /** The person moved to a row, which has this key. */
  moved(key: string): void;
}

/** What a row is told apart by when the choice is kept: an ID is only unique among rows of its kind, so it is both. */
export const rowKey = (row: Row): string => `${row.kind} ${row.id}`;

/**
 * A list of agents, rooms or threads to choose from, with the choice kept
 * across the list being drawn again. The list is handed each row's position,
 * never its ID or its text as a value, so what a row says is only what the
 * screen made of it.
 */
export function listOf(options: ListOptions): SelectList {
  const list = new SelectList(
    options.rows.map((row, index) => ({ value: String(index), label: row.label, description: row.detail })),
    Math.max(3, options.room),
    options.theme.select,
    { minPrimaryColumnWidth: 24, maxPrimaryColumnWidth: 48 },
  );
  const rowAt = (value: string): Row | undefined => options.rows[Number(value)];
  const kept = options.rows.findIndex((row) => rowKey(row) === options.chosen);
  list.setSelectedIndex(Math.max(0, kept));
  list.onSelect = (item) => {
    const row = rowAt(item.value);
    if (row !== undefined) options.open(row);
  };
  list.onSelectionChange = (item) => {
    const row = rowAt(item.value);
    if (row !== undefined) options.moved(rowKey(row));
  };
  return list;
}
