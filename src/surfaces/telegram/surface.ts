import { join } from "node:path";
import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelBus } from "../../channels/bus.js";
import type { EgressRegistry } from "../../channels/egress.js";
import type { AdapterRouteConfigEntry } from "../../config/adapter-routing.js";
import type { IdentityStore } from "../../gateway/identity-store.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import type { SurfaceThreadStateStore } from "../shared/thread-state-store.js";
import type { GatewaySurface, SurfaceEgress } from "../shared/types.js";
import { TelegramChannelBridge } from "./bridge.js";
import {
  TelegramBotApiClient,
  type TelegramUpdate,
} from "./client.js";
import { listTelegramMenuCommands } from "./commands.js";
import type { ResolvedTelegramInstanceConfig } from "./config.js";
import {
  sendTelegramPublicationText,
} from "./outbound.js";
import { TelegramPoller } from "./poller.js";

export function loadTelegramOffset(statePath: string): number {
  return readJsonFile(statePath, () => 0, (state) => {
    if (typeof state !== "object" || state === null || Array.isArray(state)) {
      return 0;
    }
    const offset = (state as Record<string, unknown>).offset;
    return typeof offset === "number" ? offset : 0;
  });
}

export function telegramStatePath(workspace: string, instanceId: string): string {
  return join(workspace, "state", "telegram", `${instanceId}.json`);
}

class TelegramSurfaceEgress implements SurfaceEgress {
  constructor(
    readonly adapter: string,
    protected readonly client: TelegramBotApiClient,
  ) {}

  registerRoute(
    registry: EgressRegistry,
    route: AdapterRouteConfigEntry,
  ): void {
    registerTelegramRoute(registry, this.client, route.channelPrefix);
  }
}

export function registerTelegramRoute(
  registry: EgressRegistry,
  telegram: Pick<TelegramBotApiClient, "sendMessage">,
  channelPrefix: string,
): void {
  registry.register(channelPrefix, async (delivery) => {
    const { channel, text, publication } = delivery;
    const chatId = parseInt(channel.slice(channelPrefix.length), 10);
    if (isNaN(chatId)) {
      console.error(`[telegram] invalid chat ID from channel: ${channel}`);
      return;
    }
    await sendTelegramPublicationText(telegram, chatId, text, publication);
  });
}

class TelegramGatewaySurface
  extends TelegramSurfaceEgress
  implements GatewaySurface {
  readonly name: string;
  private readonly bridge: TelegramChannelBridge;
  private readonly poller: TelegramPoller;
  private unsubscribeUpdate?: () => void;
  private started = false;

  constructor(
    runtime: AppRuntime,
    channelBus: ChannelBus,
    identityStore: IdentityStore,
    surfaceThreadStateStore: SurfaceThreadStateStore,
    instance: ResolvedTelegramInstanceConfig,
  ) {
    const statePath = telegramStatePath(runtime.paths.workspace, instance.id);
    const client = new TelegramBotApiClient(
      { token: instance.token },
      { policy: instance.policy },
    );
    super(instance.adapter, client);
    this.poller = new TelegramPoller(client, {
      initialOffset: loadTelegramOffset(statePath),
      onUpdateOffset: (offset) => {
        writeJsonFileAtomic(statePath, { offset });
      },
      onUpdateError: (update, err) => {
        publishTelegramUpdateError(channelBus, instance, update, err);
      },
      policy: instance.policy,
    });
    this.name = instance.surfaceId;

    this.bridge = new TelegramChannelBridge(
      {
        channelBus,
        mediaDir: runtime.paths.mediaDir,
        identityStore,
        surfaceId: instance.surfaceId,
        channelPrefix: instance.channelPrefix,
        defaultAgentId: instance.defaultAgentId,
        knownAgentIds: runtime.resolved.agents.map((agent) => agent.id),
        threadStateStore: surfaceThreadStateStore,
        allowedChatIds: instance.allowedChatIds,
        users: instance.users,
        textBurstWindowMs: instance.textBurstWindowMs,
        mediaGroupWindowMs: instance.mediaGroupWindowMs,
      },
      client,
    );
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.client.setMyCommands(listTelegramMenuCommands()).catch((err) => {
      console.error("[telegram] failed to sync bot commands:", err);
    });
    this.unsubscribeUpdate = this.poller.onUpdate((update) =>
      this.bridge.handleUpdate(update)
    );
    this.poller.start();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.unsubscribeUpdate?.();
    this.unsubscribeUpdate = undefined;
    await this.poller.stop();
    await this.bridge.flushPending();
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function publishTelegramUpdateError(
  channelBus: ChannelBus,
  instance: ResolvedTelegramInstanceConfig,
  update: TelegramUpdate,
  err: unknown,
): void {
  const chatId = update.message?.chat.id;
  if (chatId === undefined) return;

  channelBus.publishSystem({
    channel: `${instance.channelPrefix}${chatId}`,
    actorId: "system:telegram",
    transport: "telegram",
    transportChatId: String(chatId),
    data: {
      kind: "telegram_update_error",
      updateId: update.update_id,
      messageId: update.message?.message_id,
      error: errorMessage(err),
    },
  });
}

export function createTelegramSurfaceEgresses(
  runtime: AppRuntime,
  resolved: { instances: ResolvedTelegramInstanceConfig[] },
): SurfaceEgress[] {
  void runtime;
  return resolved.instances.map((instance) =>
    new TelegramSurfaceEgress(
      instance.adapter,
      new TelegramBotApiClient({ token: instance.token }, { policy: instance.policy }),
    )
  );
}

export function createTelegramGatewaySurfaces(opts: {
  runtime: AppRuntime;
  channelBus: ChannelBus;
  identityStore: IdentityStore;
  surfaceThreadStateStore: SurfaceThreadStateStore;
  resolved: { instances: ResolvedTelegramInstanceConfig[] };
}): GatewaySurface[] {
  return opts.resolved.instances.map((instance) =>
    new TelegramGatewaySurface(
      opts.runtime,
      opts.channelBus,
      opts.identityStore,
      opts.surfaceThreadStateStore,
      instance,
    )
  );
}
