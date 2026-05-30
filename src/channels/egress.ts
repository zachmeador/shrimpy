export type EgressSendFn = (channel: string, text: string) => Promise<void>;

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

  async send(channel: string, text: string): Promise<boolean> {
    for (const [prefix, send] of this.routes) {
      if (channel.startsWith(prefix)) {
        await send(channel, text);
        return true;
      }
    }
    return false;
  }
}

export interface ChannelEgress {
  deliverText(channel: string, text: string): Promise<boolean>;
}

export class EgressRegistryChannelEgress implements ChannelEgress {
  constructor(private readonly registry?: EgressRegistry) {}

  async deliverText(channel: string, text: string): Promise<boolean> {
    if (!this.registry) return false;
    return this.registry.send(channel, text);
  }
}
