/**
 * Chat is not there to be reached: no gateway is running to say where it is,
 * the gateway lists no chat server, or the one it lists is gone. That is the
 * ordinary state of a machine that is still starting, so nobody is told.
 */
export class ChatUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ChatUnavailableError";
  }
}
