import { createRemoteServiceEndpoint, RemoteServiceProvider, type Service } from "@earendil-works/chord";
import type { RoutedServerServiceAttachment, RoutedSessionHandle } from "@earendil-works/pi-server";

function providerFor<T>(service: Service<T>, implementation: T): RemoteServiceProvider {
  const provider = new RemoteServiceProvider([{ service, mode: "singleton" }]);
  // A service's members are checked to be callable from outside where it is defined.
  provider.provide(service, implementation as never);
  return provider;
}

/**
 * Offer `implementation` as `service` to one connection. `released` runs when
 * the connection is let go of, after the offer has been taken back.
 */
export function offerToConnection<T>(
  service: Service<T>,
  implementation: T,
  released?: () => void,
): RoutedServerServiceAttachment {
  const provider = providerFor(service, implementation);
  const remote = createRemoteServiceEndpoint(provider);
  return {
    invokeService: (call, publish, context) => remote.invoke(call, publish, context),
    release() {
      try {
        remote.dispose();
        provider.dispose();
      } finally {
        released?.();
      }
    },
  };
}

export interface RouteOffer {
  /** Runs when a connection attaches the route. Returns what runs when that connection lets go. */
  attached?: () => () => void;
  /** Runs when the route closes, before its offer is taken back. */
  closed?: () => void;
}

/**
 * Offer `implementation` as `service` to every connection that attaches the
 * route. A route is where the server sends a connection that asks to watch
 * something: Pi calls it a session.
 */
export function offerToRoute<T>(
  service: Service<T>,
  implementation: T,
  hooks: RouteOffer = {},
): RoutedSessionHandle {
  const provider = providerFor(service, implementation);
  return {
    attachClient() {
      const letGo = hooks.attached?.();
      const remote = createRemoteServiceEndpoint(provider);
      return {
        invokeService: (call, publish, context) => remote.invoke(call, publish, context),
        release() {
          remote.dispose();
          letGo?.();
        },
      };
    },
    close() {
      hooks.closed?.();
      provider.dispose();
      return Promise.resolve();
    },
  };
}
