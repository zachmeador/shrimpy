import { createListeners } from "../../lib/listeners/index.ts";
import { type ChannelOperations, channelOperations } from "./channels.ts";
import type { Change } from "./changes.ts";
import { openDatabase } from "./database.ts";
import { type EventOperations, eventOperations } from "./events.ts";
import { type MemberOperations, memberOperations } from "./members.ts";
import { type MessageOperations, messageOperations } from "./messages.ts";
import { type ReactionOperations, reactionOperations } from "./reactions.ts";
import { type ReceiptOperations, receiptOperations } from "./receipts.ts";
import { createSql, type Sql } from "./sql.ts";
import { type ThreadOperations, threadOperations } from "./threads.ts";

export type Transaction = MemberOperations &
  ChannelOperations &
  ThreadOperations &
  MessageOperations &
  ReactionOperations &
  EventOperations &
  ReceiptOperations;

export interface Store {
  /** The ID the store was given when it was made, which it keeps for good. */
  readonly id: string;
  /**
   * Run `work` as one transaction: what it writes commits together or not at
   * all, and nobody sees half of it. `work` must be synchronous, and the
   * transaction is not usable once it returns. Watchers hear about the
   * transaction's changes only after it commits.
   */
  transaction<T>(work: (tx: Transaction) => T): T;
  /** Be told, after each commit, what became visible. */
  subscribe(listener: (change: Change) => void): () => void;
  close(): void;
}

export interface StoreOptions {
  /** Where a failing watcher is reported. A watcher's failure never undoes a commit. */
  onError?: (error: Error) => void;
}

/**
 * Open the store in `dataDir`, taking it for this process alone. Throws
 * `StoreOwnedError` while another process or connection has it.
 */
export function openStore(dataDir: string, options: StoreOptions = {}): Store {
  const db = openDatabase(dataDir);
  const sql = createSql(db);
  const { id } = sql.one("SELECT id FROM store") as { id: string };
  const onError = options.onError ?? reportToStderr;
  const watchers = createListeners<Change>(onError);
  // Read through a function, so the compiler does not assume the answer it saw first still holds.
  const inTransaction = (): boolean => db.isTransaction;
  let closed = false;

  function transaction<T>(work: (tx: Transaction) => T): T {
    if (closed) throw new Error("The chat store is closed");
    if (inTransaction()) throw new Error("A chat store transaction is already open");
    const changes: Change[] = [];
    let active = true;
    const tx = createTransaction(onlyWhile(() => active, sql), (change) => changes.push(change));
    let result: T;
    db.exec("BEGIN IMMEDIATE");
    try {
      result = work(tx);
      db.exec("COMMIT");
    } catch (error) {
      if (inTransaction()) db.exec("ROLLBACK");
      throw error;
    } finally {
      active = false;
    }
    for (const change of changes) watchers.notify(change);
    return result;
  }

  return {
    id,
    transaction,
    subscribe: (listener) => watchers.add(listener),
    close() {
      if (closed) return;
      closed = true;
      watchers.clear();
      db.close();
    },
  };
}

function createTransaction(sql: Sql, report: (change: Change) => void): Transaction {
  return {
    ...memberOperations(sql, report),
    ...channelOperations(sql),
    ...threadOperations(sql, report),
    ...messageOperations(sql, report),
    ...reactionOperations(sql, report),
    ...eventOperations(sql),
    ...receiptOperations(sql, report),
  };
}

/** Statements that refuse to run once `active` says the transaction is over. */
function onlyWhile(active: () => boolean, sql: Sql): Sql {
  const check = (): void => {
    if (!active()) throw new Error("A chat store transaction was used after it ended");
  };
  return {
    one(text, ...params) {
      check();
      return sql.one(text, ...params);
    },
    all(text, ...params) {
      check();
      return sql.all(text, ...params);
    },
    run(text, ...params) {
      check();
      return sql.run(text, ...params);
    },
  };
}

function reportToStderr(error: Error): void {
  console.error("[chat]", error);
}
