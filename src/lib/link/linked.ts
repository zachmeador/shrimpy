import type { Link } from "@earendil-works/chord";

/** A WebSocket after the hello and its answer, as a Chord link. */
export interface Linked {
  /** For Chord's `accept` or `connect`. Its one close listener is Chord's. */
  readonly link: Link;
  /** Settles once the socket has closed, whoever closed it. */
  readonly closed: Promise<void>;
  /** Drop the socket at once, without waiting for the other end to answer. */
  drop(): void;
}
