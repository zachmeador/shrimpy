import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { openConnection } from "../../lib/connection/index.ts";
import { GATEWAY_SERVER_ID } from "./endpoint.ts";
import {
  type Announcement,
  Gateway,
  type Member,
  type ProgramName,
  type Registration,
  type RosterEntry,
  type Ticket,
} from "./services.ts";

export interface GatewayConnection {
  /**
   * Announce a program. It stays registered while this connection is open, and
   * registering again replaces the earlier entry. See `Gateway.register` for
   * who it registers as.
   */
  register(announcement: Announcement): Promise<void>;
  list(): Promise<Registration[]>;
  /** The version of Shrimpy the gateway runs. */
  version(): Promise<string>;
  /** Make a new agent member called `name`, recognized by the token the caller made, and be it from now on. See `Gateway.join`. */
  join(name: string, token: string): Promise<Member>;
  /** Be the member that holds `token` from now on, renamed to `name` unless it is null. See `Gateway.signIn`. */
  signIn(token: string, name: string | null): Promise<Member>;
  /** Everyone on the roster, oldest first. */
  members(): Promise<RosterEntry[]>;
  /** Make the agent `memberId` an admin. Only a person or an admin may. See `Gateway.promote`. */
  promote(memberId: string): Promise<Member>;
  /** Make the admin agent `memberId` an ordinary agent again, by the same rules. See `Gateway.demote`. */
  demote(memberId: string): Promise<Member>;
  /** A ticket for `target`, to hand to it, with the server ID it answers as. See `Gateway.ticket`, and `reachProgram` for using one. */
  ticket(target: ProgramName): Promise<Ticket>;
  /** Whose a ticket is. See `Gateway.redeem`. */
  redeem(ticket: string): Promise<Member>;
  /**
   * Called once when the connection ends, whether the gateway went away or
   * `close` was called. Nothing reconnects by itself: a program that wants to
   * stay registered uses `keepRegistered`, from the Node door.
   */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  /**
   * Hang up. The gateway drops a connection's registration when the connection
   * ends, so there is nothing to say goodbye to, and a gateway that has stopped
   * answering cannot hold this up.
   */
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function connectGateway(options: {
  transportFactory: ByteTransportFactory;
  /** Abort to give up while connecting, even on a gateway that stopped answering. */
  signal?: AbortSignal;
}): Promise<GatewayConnection> {
  const connection = await openConnection({
    serverId: GATEWAY_SERVER_ID,
    transportFactory: options.transportFactory,
    service: Gateway,
    signal: options.signal,
  });
  const gateway = connection.service;
  return {
    register: (announcement) => gateway.register(announcement, context),
    list: () => gateway.list(context),
    version: () => gateway.version(context),
    join: (name, token) => gateway.join(name, token, context),
    signIn: (token, name) => gateway.signIn(token, name, context),
    members: () => gateway.members(context),
    promote: (memberId) => gateway.promote(memberId, context),
    demote: (memberId) => gateway.demote(memberId, context),
    ticket: (target) => gateway.ticket(target, context),
    redeem: (ticket) => gateway.redeem(ticket, context),
    onDisconnect: (listener) => connection.onDisconnect(listener),
    close: () => connection.close({ goodbye: false }),
  };
}
