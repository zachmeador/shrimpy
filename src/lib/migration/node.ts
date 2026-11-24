/**
 * What a program does with a store it owns when it starts: open it as it is,
 * copy it aside before migrating it, or refuse it with words saying what to do.
 * The copy sits beside the store, named for the release that migrated it, and
 * stays until the next migration. A copy of SQLite is one file. Node only, so
 * this is its only door. It must not know what a store holds or how its steps
 * are run.
 */
export { beforeOpening, migrationCopy, type StoreAtStart, type StoreFormat, type Step } from "./migration.node.ts";
export { copySqlite, sqliteBeside } from "./sqlite.node.ts";
