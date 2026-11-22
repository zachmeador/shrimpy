/**
 * Your settings, from the file the gateway is given: your name, read when the
 * gateway starts and again whenever the file changes, and where the page's
 * door listens and the certificate it serves with, read when it starts. It
 * must not know where the file is kept or what becomes of a setting.
 */
export { followSettings, type PageSettings, readSettings, type Settings } from "./settings.ts";
