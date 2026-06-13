import {
  existsSync,
} from "node:fs";
import {
  loadCursors,
  saveCursors,
  type ChannelCursor,
  type ChannelWatcher,
} from "./store.js";
import type { ChannelBus } from "./bus.js";
import type { EgressRegistry } from "./egress.js";
import type { ChannelMembershipStore } from "./membership.js";
import type { ChannelMessage } from "./protocol.js";
import type { PublicationIntent } from "./messages.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { isRecord } from "../util/record.js";

export type DeliveryReceiptStatus = "delivered" | "failed" | "retrying" | "skipped";

export interface DeliveryReceipt {
  channel: string;
  messageId: string;
  status: DeliveryReceiptStatus;
  attempts: number;
  updatedAt: number;
  deliveredAt?: number;
  nextAttemptAt?: number;
  error?: string;
}

export type DeliveryReceiptsFile = Record<string, Record<string, DeliveryReceipt>>;

export interface ChannelOutboxOpts {
  channelBus: ChannelBus;
  memberships: ChannelMembershipStore;
  egressRegistry: EgressRegistry;
  cursorsPath: string;
  receiptsPath: string;
  retry?: {
    initialMs?: number;
    maxMs?: number;
    maxAttempts?: number;
  };
}

export class DeliveryReceiptStore {
  constructor(private readonly path: string) {}

  read(): DeliveryReceiptsFile {
    return readDeliveryReceipts(this.path);
  }

  get(channel: string, messageId: string): DeliveryReceipt | null {
    return this.read()[channel]?.[messageId] ?? null;
  }

  put(receipt: DeliveryReceipt): void {
    const receipts = this.read();
    receipts[receipt.channel] = receipts[receipt.channel] ?? {};
    receipts[receipt.channel]![receipt.messageId] = receipt;
    writeJsonFileAtomic(this.path, receipts);
  }
}

export class ChannelOutbox {
  private readonly channelBus: ChannelBus;
  private readonly memberships: ChannelMembershipStore;
  private readonly egressRegistry: EgressRegistry;
  private readonly receiptStore: DeliveryReceiptStore;
  private readonly cursorsPath: string;
  private readonly retryInitialMs: number;
  private readonly retryMaxMs: number;
  private readonly retryMaxAttempts: number;
  private channelChains = new Map<string, Promise<void>>();
  private cursors: Record<string, ChannelCursor> = {};
  private watcher: ChannelWatcher | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: ChannelOutboxOpts) {
    this.channelBus = opts.channelBus;
    this.memberships = opts.memberships;
    this.egressRegistry = opts.egressRegistry;
    this.cursorsPath = opts.cursorsPath;
    this.receiptStore = new DeliveryReceiptStore(opts.receiptsPath);
    this.retryInitialMs = opts.retry?.initialMs ?? 1000;
    this.retryMaxMs = opts.retry?.maxMs ?? 60_000;
    this.retryMaxAttempts = opts.retry?.maxAttempts ?? 5;
  }

  async drainBacklog(): Promise<void> {
    if (!existsSync(this.cursorsPath)) {
      const currentCursors = this.channelBus.currentCursors();
      saveCursors(this.cursorsPath, currentCursors);
      this.cursors = currentCursors;
      this.scheduleNextRetry();
      return;
    }

    const cursors = loadCursors(this.cursorsPath);
    const backlog: Array<{ channel: string; message: ChannelMessage }> = [];
    const updatedCursors = this.channelBus.drainBacklog(
      cursors,
      (channel, messages) => {
        for (const message of messages) {
          backlog.push({ channel, message });
        }
      },
    );

    for (const entry of backlog) {
      await this.enqueue(entry.channel, entry.message, "backlog");
    }

    saveCursors(this.cursorsPath, updatedCursors);
    this.cursors = updatedCursors;
    this.scheduleNextRetry();
  }

  start(): void {
    if (this.watcher) throw new Error("[outbox] already started");
    this.watcher = this.channelBus.watch(
      (channel, messages) => {
        for (const message of messages) {
          void this.enqueue(channel, message, "live");
        }
      },
      this.cursors,
    );
    this.scheduleNextRetry();
  }

  async stop(): Promise<void> {
    this.watcher?.stop();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    await Promise.allSettled(this.channelChains.values());
    if (this.watcher) {
      saveCursors(this.cursorsPath, this.watcher.getCursors());
    }
  }

  private enqueue(
    channel: string,
    message: ChannelMessage,
    source: "backlog" | "live" | "retry",
  ): Promise<void> {
    const previous = this.channelChains.get(channel) ?? Promise.resolve();
    const next = previous
      .catch((err) => {
        console.error(`[outbox] channel queue error for ${channel}:`, err);
      })
      .then(() => this.processMessage(channel, message, source))
      .finally(() => {
        if (this.channelChains.get(channel) === next) {
          this.channelChains.delete(channel);
        }
        if (source === "live") {
          this.saveLiveCursorsIfIdle();
        }
      });
    this.channelChains.set(channel, next);
    return next;
  }

  private saveLiveCursorsIfIdle(): void {
    if (!this.watcher || this.channelChains.size > 0) return;
    saveCursors(this.cursorsPath, this.watcher.getCursors());
  }

  private async processMessage(
    channel: string,
    message: ChannelMessage,
    _source: "backlog" | "live" | "retry",
  ): Promise<void> {
    if (!shouldDeliverOutbound(message)) return;
    const manifest = this.memberships.getManifest(channel);
    const binding = manifest.binding;
    if (!binding) {
      this.receiptStore.put({
        channel,
        messageId: message.id,
        status: "skipped",
        attempts: 0,
        updatedAt: Date.now(),
        error: "channel has no transport binding",
      });
      return;
    }

    const existing = this.receiptStore.get(channel, message.id);
    if (existing?.status === "delivered" || existing?.status === "failed") return;
    if (existing?.nextAttemptAt && existing.nextAttemptAt > Date.now()) {
      this.scheduleNextRetry();
      return;
    }

    const attempts = (existing?.attempts ?? 0) + 1;
    try {
      const routed = await this.egressRegistry.send({ channel, binding, message });
      if (!routed) {
        throw new Error(`no egress route for ${binding.adapter}/${binding.instance}`);
      }
      this.receiptStore.put({
        channel,
        messageId: message.id,
        status: "delivered",
        attempts,
        updatedAt: Date.now(),
        deliveredAt: Date.now(),
      });
    } catch (err) {
      const retrying = attempts < this.retryMaxAttempts;
      const nextAttemptAt = retrying
        ? Date.now() + Math.min(this.retryInitialMs * 2 ** (attempts - 1), this.retryMaxMs)
        : undefined;
      this.receiptStore.put({
        channel,
        messageId: message.id,
        status: retrying ? "retrying" : "failed",
        attempts,
        updatedAt: Date.now(),
        ...(nextAttemptAt ? { nextAttemptAt } : {}),
        error: formatError(err),
      });
      if (retrying) this.scheduleNextRetry();
    }
  }

  private scheduleNextRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    const now = Date.now();
    let nextAt: number | undefined;
    const receipts = this.receiptStore.read();
    for (const channelReceipts of Object.values(receipts)) {
      for (const receipt of Object.values(channelReceipts)) {
        if (receipt.status !== "retrying" || !receipt.nextAttemptAt) continue;
        nextAt = nextAt === undefined
          ? receipt.nextAttemptAt
          : Math.min(nextAt, receipt.nextAttemptAt);
      }
    }
    if (nextAt === undefined) return;

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.retryDueMessages();
    }, Math.max(0, nextAt - now));
  }

  private async retryDueMessages(): Promise<void> {
    const now = Date.now();
    const receipts = this.receiptStore.read();
    const due: Array<{ channel: string; messageId: string }> = [];
    for (const [channel, channelReceipts] of Object.entries(receipts)) {
      for (const receipt of Object.values(channelReceipts)) {
        if (
          receipt.status === "retrying" &&
          receipt.nextAttemptAt !== undefined &&
          receipt.nextAttemptAt <= now
        ) {
          due.push({ channel, messageId: receipt.messageId });
        }
      }
    }

    for (const item of due) {
      const message = this.channelBus.read(item.channel).messages.find((candidate) =>
        candidate.id === item.messageId
      );
      if (message) await this.enqueue(item.channel, message, "retry");
    }
    this.scheduleNextRetry();
  }
}

export function readDeliveryReceipts(path: string): DeliveryReceiptsFile {
  return readJsonFile(path, () => ({}), (raw) => {
    if (!isRecord(raw)) return {};
    const result: DeliveryReceiptsFile = {};
    for (const [channel, value] of Object.entries(raw)) {
      if (!isRecord(value)) continue;
      const receipts: Record<string, DeliveryReceipt> = {};
      for (const [messageId, receipt] of Object.entries(value)) {
        if (!isRecord(receipt)) continue;
        if (!isDeliveryReceiptStatus(receipt.status)) continue;
        if (typeof receipt.attempts !== "number") continue;
        if (typeof receipt.updatedAt !== "number") continue;
        receipts[messageId] = {
          channel,
          messageId,
          status: receipt.status,
          attempts: receipt.attempts,
          updatedAt: receipt.updatedAt,
          ...(typeof receipt.deliveredAt === "number" ? { deliveredAt: receipt.deliveredAt } : {}),
          ...(typeof receipt.nextAttemptAt === "number" ? { nextAttemptAt: receipt.nextAttemptAt } : {}),
          ...(typeof receipt.error === "string" ? { error: receipt.error } : {}),
        };
      }
      result[channel] = receipts;
    }
    return result;
  });
}

export function summarizeDeliveryReceipts(
  receipts: DeliveryReceiptsFile,
  channel: string,
): {
  delivered: number;
  failed: number;
  retrying: number;
  skipped: number;
  undelivered: number;
  lastReceipt?: DeliveryReceipt;
} {
  const values = Object.values(receipts[channel] ?? {});
  const counts = {
    delivered: values.filter((receipt) => receipt.status === "delivered").length,
    failed: values.filter((receipt) => receipt.status === "failed").length,
    retrying: values.filter((receipt) => receipt.status === "retrying").length,
    skipped: values.filter((receipt) => receipt.status === "skipped").length,
  };
  const lastReceipt = values.sort((left, right) => left.updatedAt - right.updatedAt).at(-1);
  return {
    ...counts,
    undelivered: counts.failed + counts.retrying,
    ...(lastReceipt ? { lastReceipt } : {}),
  };
}

export function outboundTextForMessage(message: ChannelMessage): string | null {
  switch (message.content.type) {
    case "text":
      return message.content.data.text;
    case "status":
      if (message.content.data.kind === "operation_status") {
        return message.content.data.text;
      }
      return null;
    case "control":
    case "system":
      return null;
    case "unsupported_media":
      return null;
    case "image":
    case "image_group":
      return message.content.data.caption ?? null;
  }
}

export function publicationIntentForMessage(
  message: ChannelMessage,
): PublicationIntent | undefined {
  return message.content.type === "text"
    ? message.content.data.publication
    : undefined;
}

function shouldDeliverOutbound(message: ChannelMessage): boolean {
  if (message.sender.kind !== "agent" && message.sender.kind !== "system") {
    return false;
  }

  switch (message.content.type) {
    case "text":
    case "image":
    case "image_group":
      return true;
    case "status":
      return message.content.data.kind === "operation_status";
    default:
      return false;
  }
}

function isDeliveryReceiptStatus(value: unknown): value is DeliveryReceiptStatus {
  return value === "delivered" ||
    value === "failed" ||
    value === "retrying" ||
    value === "skipped";
}

function formatError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return String(err);
}
