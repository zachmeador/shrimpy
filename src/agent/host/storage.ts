import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { beforeOpening, copySqlite, sqliteBeside, type Step, type StoreFormat } from "../../lib/migration/node.ts";
import { PI_PACKAGES } from "../../lib/version/index.ts";
import { storageOfAnotherVersion } from "../home/index.ts";

/**
 * What a version of an agent's storage holds: the Pi packages that write it,
 * and the version of each of Shrimpy's documents and tasks in it. Pi brings its
 * own part up to date when it opens the storage, and Durable's `migrate` brings
 * each of Shrimpy's documents and tasks up to date when it is read, so going up
 * a version runs nothing itself. It has the storage copied before Pi opens it,
 * and older releases refuse it.
 */
export interface StorageVersion extends Step {
  readonly pi: string;
  readonly documents: Readonly<Record<string, number>>;
  readonly tasks: Readonly<Record<string, number>>;
}

/**
 * This release's format of an agent's storage, whose version is kept in the
 * storage's own table `shrimpy_storage`. A change to the Pi packages, or to the
 * version of one of Shrimpy's documents or tasks, is a change to the format.
 */
export const AGENT_STORAGE: StoreFormat<StorageVersion> = {
  current: 2,
  oldest: 1,
  steps: [
    {
      version: 1,
      pi: "1.5.2",
      documents: { "shrimpy.records": 3, "shrimpy.sessions": 3, "shrimpy.questions": 1, "shrimpy.triggers": 1, "shrimpy.feed": 3 },
      tasks: {
        "shrimpy.turn": 2,
        "shrimpy.turn-wait": 1,
        "shrimpy.wakeup": 1,
        "shrimpy.question": 1,
        "shrimpy.trigger": 1,
        "shrimpy.trigger-run": 1,
      },
    },
    {
      version: 2,
      pi: "1.5.2",
      documents: {
        "shrimpy.records": 3,
        "shrimpy.sessions": 4,
        "shrimpy.watches": 1,
        "shrimpy.processes": 1,
        "shrimpy.triggers": 1,
        "shrimpy.feed": 3,
      },
      tasks: {
        "shrimpy.turn": 2,
        "shrimpy.turn-wait": 1,
        "shrimpy.trigger": 1,
        "shrimpy.trigger-run": 1,
        "shrimpy.trigger-once": 1,
      },
    },
  ],
};

/** Storage from before `shrimpy_storage` is at version 1, the format 1.0.0 ships. */
const BEFORE_THE_TABLE = 1;

/**
 * The version of Pi's storage since Shrimpy moved to Pi 1.5.2. Pi 1.0 kept its
 * storage at version 1, and Pi 1.5 takes storage to version 2 when it opens it,
 * after which it would read Shrimpy's records and tasks from before the move as
 * if they were current.
 */
const SINCE_THE_MOVE = 2;

/**
 * Make the home's Pi storage at `database` ready for Pi to open, while the
 * owner holds the home's lock: new storage gets this release's version, and
 * storage at an older version is copied aside first. Storage a newer release
 * wrote is refused, naming the copy to put back, and so is storage from before
 * the move to Pi 1.5.2. What is refused is only read.
 */
export function prepareStorage(database: string, format: StoreFormat<StorageVersion>): void {
  if (!existsSync(database)) {
    mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
    write(database, (db) => keepVersion(db, format.current));
    return;
  }
  const { pi, found } = readVersions(database);
  if (pi !== undefined && pi < SINCE_THE_MOVE) throw new Error(storageOfAnotherVersion(database));
  const store = {
    file: database,
    beside: sqliteBeside(database),
    what: `The agent's Pi storage at ${database}`,
    program: "the agent",
    startingOver: "Its sessions go with it, and the rest of the home stays.",
    found,
    format,
  };
  const steps = beforeOpening(store, (to) => write(database, (db) => copySqlite(db, to)));
  if (steps.length > 0) write(database, (db) => keepVersion(db, format.current));
}

/**
 * Check what this code installs against what its storage's version says it
 * holds, so that a change to the Pi packages, or to the version of one of
 * Shrimpy's documents or tasks, comes with a new version of the storage, which
 * is what has the storage copied before the change reaches it. A mismatch is a
 * mistake in this code, and stops the agent at its start.
 */
export function checkStorageVersion(
  installed: {
    documents: readonly { definition: { kind: string; version: number } }[];
    extensions: readonly { tasks?: readonly { definition: { name: string; version: number } }[] }[];
  },
  format: StoreFormat<StorageVersion>,
): void {
  const said = format.steps.find((step) => step.version === format.current);
  const pi = [...new Set(Object.values(PI_PACKAGES))];
  const documents = Object.fromEntries(installed.documents.map(({ definition }) => [definition.kind, definition.version]));
  const tasks = Object.fromEntries(installed.extensions.flatMap((extension) => extension.tasks ?? []).map(({ definition }) => [definition.name, definition.version]));
  const same = (a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): boolean =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([name, version]) => b[name] === version);
  if (said !== undefined && pi.length === 1 && pi[0] === said.pi && same(documents, said.documents) && same(tasks, said.tasks)) return;
  throw new Error(
    `This code runs Pi ${pi.join(", ")} with ${JSON.stringify({ documents, tasks })}, which isn't what version ${String(format.current)} ` +
      "of an agent's storage holds. A change to the Pi packages, or to the version of one of Shrimpy's documents or tasks, " +
      "adds the next version of the storage in src/agent/host/storage.ts, or edits it before the release that adds it.",
  );
}

/** The version of Pi's own tables and of Shrimpy's storage, read without changing the file. */
function readVersions(database: string): { pi: number | undefined; found: number } {
  const name = pathToFileURL(database);
  // With no log beside it, everything is in the file, which is read as it is, so SQLite makes no files beside it.
  if (!existsSync(`${database}-wal`)) name.searchParams.set("immutable", "1");
  const db = new DatabaseSync(name, { readOnly: true });
  try {
    const kept = (table: string): boolean => db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== undefined;
    const version = (table: string): number | undefined =>
      kept(table) ? (db.prepare(`SELECT version FROM ${table} WHERE singleton = 1`).get() as { version: number } | undefined)?.version : undefined;
    return { pi: version("durable_schema"), found: version("shrimpy_storage") ?? BEFORE_THE_TABLE };
  } finally {
    db.close();
  }
}

function keepVersion(db: DatabaseSync, version: number): void {
  db.exec("CREATE TABLE IF NOT EXISTS shrimpy_storage (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), version INTEGER NOT NULL) STRICT");
  db.prepare("INSERT INTO shrimpy_storage (singleton, version) VALUES (1, ?) ON CONFLICT (singleton) DO UPDATE SET version = excluded.version").run(version);
}

function write(database: string, work: (db: DatabaseSync) => void): void {
  const db = new DatabaseSync(database);
  try {
    work(db);
  } finally {
    db.close();
  }
}
