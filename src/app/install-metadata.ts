import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { writeJsonFileAtomic } from "../util/json-file.js";

export const INSTALL_METADATA_FILENAME = ".shrimpy-install.json";
export const INSTALL_METADATA_SCHEMA_VERSION = 1;

export interface ShrimpyInstallMetadata {
  schemaVersion: typeof INSTALL_METADATA_SCHEMA_VERSION;
  managed: true;
  installDir: string;
  origin: string;
  requestedRef: string;
  installedRef: string;
  installedCommit: string;
}

export function installMetadataPath(appRoot: string): string {
  return join(dirname(resolve(appRoot)), INSTALL_METADATA_FILENAME);
}

export function readShrimpyInstallMetadata(
  appRoot: string,
): ShrimpyInstallMetadata | undefined {
  const path = installMetadataPath(appRoot);
  if (!existsSync(path)) return undefined;
  const parsed = parseShrimpyInstallMetadata(
    JSON.parse(readFileSync(path, "utf-8")),
  );
  return resolve(parsed.installDir) === resolve(appRoot) ? parsed : undefined;
}

export function writeShrimpyInstallMetadata(
  appRoot: string,
  metadata: Omit<
    ShrimpyInstallMetadata,
    "schemaVersion" | "managed" | "installDir"
  >,
): ShrimpyInstallMetadata {
  const value: ShrimpyInstallMetadata = {
    schemaVersion: INSTALL_METADATA_SCHEMA_VERSION,
    managed: true,
    installDir: resolve(appRoot),
    ...metadata,
  };
  writeJsonFileAtomic(installMetadataPath(appRoot), value);
  return value;
}

export function parseShrimpyInstallMetadata(
  raw: unknown,
): ShrimpyInstallMetadata {
  if (!isRecord(raw)) throw new Error("invalid Shrimpy install metadata");
  if (raw.schemaVersion !== INSTALL_METADATA_SCHEMA_VERSION) {
    throw new Error("unsupported Shrimpy install metadata version");
  }
  if (raw.managed !== true) {
    throw new Error("Shrimpy install metadata is not managed");
  }
  return {
    schemaVersion: INSTALL_METADATA_SCHEMA_VERSION,
    managed: true,
    installDir: requiredString(raw.installDir, "installDir"),
    origin: requiredString(raw.origin, "origin"),
    requestedRef: requiredString(raw.requestedRef, "requestedRef"),
    installedRef: requiredString(raw.installedRef, "installedRef"),
    installedCommit: requiredString(raw.installedCommit, "installedCommit"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`invalid Shrimpy install metadata ${label}`);
  }
  return value;
}
