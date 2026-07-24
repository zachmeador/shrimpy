import { join } from "node:path";
import type { ChannelBus } from "../../channels/bus.js";
import type {
  ChannelActivityHandle,
  EgressRegistry,
} from "../../channels/egress.js";
import type { IdentityStore } from "../../gateway/identity-store.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../../util/json-file.js";
import type { SurfaceThreadStateStore } from "../shared/thread-state-store.js";
import type { SurfaceRuntime } from "../shared/module.js";
import type { GatewaySurface, SurfaceEgress } from "../shared/types.js";
import { UserPresenceStore } from "../shared/user-presence.js";
import { TelegramChannelBridge } from "./bridge.js";
import {
  TelegramApiError,
  TelegramBotApiClient,
  type TelegramUpdate,
} from "./client.js";
import { listTelegramMenuCommands } from "./commands.js";
import type { ResolvedTelegramInstanceConfig } from "./config.js";
import {
  sendTelegramChannelMessage,
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
    private readonly instanceId: string,
    private readonly defaultAgentId: string,
    protected readonly client: TelegramBotApiClient,
  ) {}

  registerEgress(
    registry: EgressRegistry,
  ): void {
    registerTelegramEgress(
      registry,
      this.client,
      this.instanceId,
      this.defaultAgentId,
    );
  }
}

export function registerTelegramEgress(
  registry: EgressRegistry,
  telegram: Pick<TelegramBotApiClient, "sendMessage" | "sendPhoto" | "sendChatAction">,
  instanceId: string,
  defaultAgentId: string,
): void {
  registry.register({ adapter: "telegram", instance: instanceId }, async (delivery) => {
    const chatId = parseInt(delivery.binding.thread, 10);
    if (isNaN(chatId)) {
      console.error(`[telegram] invalid chat ID from binding: ${delivery.binding.thread}`);
      return;
    }
    await sendTelegramChannelMessage(
      telegram,
      chatId,
      delivery.message,
      defaultAgentId,
    );
  });
  registry.registerActivity({ adapter: "telegram", instance: instanceId }, async (activity) => {
    if (activity.kind !== "typing") return null;
    const chatId = activity.binding ? parseInt(activity.binding.thread, 10) : NaN;
    if (isNaN(chatId)) {
      console.error(`[telegram] invalid chat ID from binding for ${activity.channel}`);
      return null;
    }
    return startTelegramTypingActivity(telegram, chatId);
  });
}

function startTelegramTypingActivity(
  telegram: Pick<TelegramBotApiClient, "sendChatAction">,
  chatId: number,
): ChannelActivityHandle {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const stopTimer = () => {
    if (!timer) return;
    clearInterval(timer);
    timer = undefined;
  };

  const send = async () => {
    if (stopped) return;
    try {
      await telegram.sendChatAction(chatId, "typing");
    } catch (err) {
      if (
        err instanceof TelegramApiError &&
        (err.errorCode === 401 || err.errorCode === 403)
      ) {
        stopped = true;
        stopTimer();
      }
      console.error("[telegram] failed to send typing activity:", err);
    }
  };

  void send();
  timer = setInterval(() => {
    void send();
  }, 4000);

  return {
    stop() {
      stopped = true;
      stopTimer();
    },
  };
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
    runtime: SurfaceRuntime,
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
    super(instance.adapter, instance.id, instance.defaultAgentId, client);
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
        instanceId: instance.id,
        channelPrefix: instance.channelPrefix,
        defaultAgentId: instance.defaultAgentId,
        knownAgentIds: runtime.resolved.agents.map((agent) => agent.id),
        threadStateStore: surfaceThreadStateStore,
        channelMemberships: runtime.createChannelMembershipStore(),
        userPresenceStore: new UserPresenceStore(runtime.paths.userPresencePath),
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

  health() {
    return this.poller.health();
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
  runtime: SurfaceRuntime,
  resolved: { instances: ResolvedTelegramInstanceConfig[] },
): SurfaceEgress[] {
  void runtime;
  return resolved.instances.map((instance) =>
    new TelegramSurfaceEgress(
      instance.adapter,
      instance.id,
      instance.defaultAgentId,
      new TelegramBotApiClient({ token: instance.token }, { policy: instance.policy }),
    )
  );
}

export function createTelegramGatewaySurfaces(opts: {
  runtime: SurfaceRuntime;
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
