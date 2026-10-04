import type { DatabaseSync, SQLInputValue, SQLOutputValue, StatementSync } from "node:sqlite";

export type Row = Record<string, SQLOutputValue>;

/** Statements for one connection, prepared once per text and reused. */
export interface Sql {
  one(text: string, ...params: SQLInputValue[]): Row | undefined;
  all(text: string, ...params: SQLInputValue[]): Row[];
  /** Run a statement and say how many rows it changed. */
  run(text: string, ...params: SQLInputValue[]): number;
}

export function createSql(db: DatabaseSync): Sql {
  const prepared = new Map<string, StatementSync>();
  const statement = (text: string): StatementSync => {
    let found = prepared.get(text);
    if (found === undefined) {
      found = db.prepare(text);
      prepared.set(text, found);
    }
    return found;
  };
  return {
    one: (text, ...params) => statement(text).get(...params),
    all: (text, ...params) => statement(text).all(...params),
    run: (text, ...params) => Number(statement(text).run(...params).changes),
  };
}
