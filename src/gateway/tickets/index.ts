/**
 * Tickets: what a client is given to hand to a program so that the program can
 * ask the gateway whose it is. Single-use, short-lived and good for one program
 * only, which the gateway can look at without spending. It must not know how a
 * ticket is asked for or handed over, or who the members are.
 */
export { createTickets, type Redeemed, TICKET_MS, type Tickets, type TicketsOptions } from "./tickets.ts";
