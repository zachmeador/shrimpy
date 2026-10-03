import { type Client, DisconnectedError } from "@earendil-works/pi-client";

/**
 * The server announces the attached route out of band, after `attach` resolves
 * or before. Start listening before attaching: `arrived` settles when the
 * route is announced, or rejects if the connection ends first. `cancel` stops
 * listening when the attach fails and the route will never be wanted.
 */
export function expectRoute(client: Client): { arrived: Promise<void>; cancel: () => void } {
  let stop = (): void => {};
  const arrived = new Promise<void>((resolve, reject) => {
    const stopRoute = client.onAttachmentChange((attachment) => {
      if (attachment === undefined) return;
      stop();
      resolve();
    });
    const stopConnection = client.onConnectionStateChange(({ state, error }) => {
      if (state !== "disconnected") return;
      stop();
      reject(error ?? new DisconnectedError());
    });
    stop = () => {
      stopRoute();
      stopConnection();
    };
  });
  // A route that is cancelled or never awaited is not an unhandled rejection.
  arrived.catch(() => undefined);
  return { arrived, cancel: () => stop() };
}
