import type { ChannelMessage } from "./protocol.js";
import type { PublicationIntent } from "./messages.js";

export interface ChannelDelivery {
  channel: string;
  text: string;
  message?: ChannelMessage;
  publication?: PublicationIntent;
}

export type EgressSendFn = (delivery: ChannelDelivery) => Promise<void>;

/**
 * Channel-prefix → outbound send function. Surfaces register a route
 * (prefix + send fn); the egress dispatcher consults the registry when
 * delivering text that has been logged to a channel.
 */
export class EgressRegistry {
  private routes = new Map<string, EgressSendFn>();

  register(prefix: string, send: EgressSendFn): void {
    this.routes.set(prefix, send);
  }

  async send(delivery: ChannelDelivery): Promise<boolean> {
    for (const [prefix, send] of this.routes) {
      if (delivery.channel.startsWith(prefix)) {
        await send(delivery);
        return true;
      }
    }
    return false;
  }
}

export interface ChannelEgress {
  deliver(delivery: ChannelDelivery): Promise<boolean>;
  deliverText(channel: string, text: string): Promise<boolean>;
}

export class EgressRegistryChannelEgress implements ChannelEgress {
  constructor(private readonly registry?: EgressRegistry) {}

  async deliver(delivery: ChannelDelivery): Promise<boolean> {
    if (!this.registry) return false;
    return this.registry.send(delivery);
  }

  async deliverText(channel: string, text: string): Promise<boolean> {
    return this.deliver({ channel, text });
  }
}
