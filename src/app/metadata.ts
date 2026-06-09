import { readFileSync } from "node:fs";

interface AppMetadata {
  name: string;
  version: string;
  description: string;
  releaseName?: string;
}

interface PackageMetadata {
  name?: unknown;
  version?: unknown;
  description?: unknown;
  shrimpy?: {
    releaseName?: unknown;
  };
}

let cachedMetadata: AppMetadata | undefined;

export function readAppMetadata(): AppMetadata {
  cachedMetadata ??= parsePackageMetadata(
    readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
  );
  return cachedMetadata;
}

export function parsePackageMetadata(text: string): AppMetadata {
  const parsed = JSON.parse(text) as PackageMetadata;
  return {
    name: readString(parsed.name, "shrimpy"),
    version: readString(parsed.version, "0.0.0"),
    description: readString(parsed.description, "a home agent"),
    releaseName: readOptionalString(parsed.shrimpy?.releaseName),
  };
}

export function formatVersionLabel(metadata = readAppMetadata()): string {
  const base = `${metadata.name} v${metadata.version}`;
  return metadata.releaseName ? `${base} - ${metadata.releaseName}` : base;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== ""
    ? value
    : undefined;
}
