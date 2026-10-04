import type { ChannelMessage } from "./protocol.js";
import type { ChannelTransportBinding } from "./manifest.js";

export interface ChannelDelivery {
  channel: string;
  binding: ChannelTransportBinding;
  message: ChannelMessage;
}

export interface ChannelActivity {
  channel: string;
  binding?: ChannelTransportBinding;
  kind: "typing";
}

export interface ChannelActivityHandle {
  stop(): void | Promise<void>;
}

type EgressSendFn = (delivery: ChannelDelivery) => Promise<void>;
type EgressActivityFn = (activity: ChannelActivity) => Promise<ChannelActivityHandle | null>;

/**
 * Transport binding → outbound send function. Surfaces register an adapter
 * instance sender; the outbox dispatcher supplies the channel manifest binding.
 */
export class EgressRegistry {
  private routes = new Map<string, EgressSendFn>();
  private activityRoutes = new Map<string, EgressActivityFn>();

  register(binding: Pick<ChannelTransportBinding, "adapter" | "instance">, send: EgressSendFn): void {
    this.routes.set(bindingKey(binding), send);
  }

  registerActivity(
    binding: Pick<ChannelTransportBinding, "adapter" | "instance">,
    start: EgressActivityFn,
  ): void {
    this.activityRoutes.set(bindingKey(binding), start);
  }

  async send(delivery: ChannelDelivery): Promise<boolean> {
    const send = this.routes.get(bindingKey(delivery.binding));
    if (!send) return false;
    await send(delivery);
    return true;
  }

  hasRoute(binding: ChannelTransportBinding): boolean {
    return this.routes.has(bindingKey(binding));
  }

  hasActivityRoute(binding: ChannelTransportBinding): boolean {
    return this.activityRoutes.has(bindingKey(binding));
  }

  async startActivity(
    activity: ChannelActivity,
  ): Promise<ChannelActivityHandle | null> {
    if (!activity.binding) return null;
    const start = this.activityRoutes.get(bindingKey(activity.binding));
    if (!start) return null;
    return start(activity);
  }
}

function bindingKey(binding: Pick<ChannelTransportBinding, "adapter" | "instance">): string {
  return `${binding.adapter}:${binding.instance}`;
}

export interface ChannelEgress {
  deliver(delivery: ChannelDelivery): Promise<boolean>;
  startActivity(activity: ChannelActivity): Promise<ChannelActivityHandle | null>;
}

export class EgressRegistryChannelEgress implements ChannelEgress {
  constructor(private readonly registry?: EgressRegistry) {}

  async deliver(delivery: ChannelDelivery): Promise<boolean> {
    if (!this.registry) return false;
    return this.registry.send(delivery);
  }

  async startActivity(
    activity: ChannelActivity,
  ): Promise<ChannelActivityHandle | null> {
    if (!this.registry) return null;
    return this.registry.startActivity(activity);
  }
}
