import type { ByteTransportFactory } from "@earendil-works/pi-client";

export interface Freezable {
  /** Reaches the same server as the transport it wraps. */
  readonly transportFactory: ByteTransportFactory;
  /**
   * From now on nothing the server sends reaches the client, and the connection
   * stays open: the server looks like a process that is stopped or stuck. A
   * connection made after this is frozen from its first byte.
   */
  freeze(): void;
}

/** Wrap a transport so that its server can be made to stop answering without going away. */
export function freezable(transportFactory: ByteTransportFactory): Freezable {
  let frozen = false;
  return {
    transportFactory: (handlers) =>
      transportFactory({
        ...handlers,
        onData(chunk) {
          if (!frozen) handlers.onData(chunk);
        },
      }),
    freeze() {
      frozen = true;
    },
  };
}
