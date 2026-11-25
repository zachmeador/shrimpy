import { obj, type Static, str } from "@earendil-works/chord";

/** Where a program runs: its machine's name, the system and the account, such as "cashmoney", "Linux arm64" and "shrimpy". */
export const MACHINE_FIELDS = { host: str(), system: str(), account: str() };

export const MachineSchema = obj(MACHINE_FIELDS);
export type Machine = Static<typeof MachineSchema>;

/** Where an agent lives: the machine its program runs on, and its home's path there. */
export const WhereSchema = obj({ machine: MachineSchema, home: str() });
export type Where = Static<typeof WhereSchema>;
