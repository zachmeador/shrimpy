import { isRecord } from "../util/record.js";

export type ChannelKind = "home" | "surface-thread" | "dm" | "work";

export interface ChannelTransportBinding {
  adapter: string;
  instance: string;
  thread: string;
}

export interface ChannelManifest {
  kind: ChannelKind;
  binding?: ChannelTransportBinding;
}

export function normalizeChannelManifest(
  value: unknown,
): ChannelManifest | undefined {
  if (!isRecord(value)) return undefined;
  if (!isChannelKind(value.kind)) return undefined;
  const binding = normalizeTransportBinding(value.binding);
  return {
    kind: value.kind,
    ...(binding ? { binding } : {}),
  };
}

export function normalizeTransportBinding(
  value: unknown,
): ChannelTransportBinding | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.adapter !== "string" || value.adapter.trim() === "") return undefined;
  if (typeof value.instance !== "string" || value.instance.trim() === "") return undefined;
  if (typeof value.thread !== "string" || value.thread.trim() === "") return undefined;
  return {
    adapter: value.adapter.trim(),
    instance: value.instance.trim(),
    thread: value.thread.trim(),
  };
}

export function deriveChannelManifest(channel: string): ChannelManifest {
  if (channel === "home") return { kind: "home" };
  if (channel.startsWith("dm~")) return { kind: "dm" };

  const telegram = /^telegram~([^~]+)~(.+)$/.exec(channel);
  if (telegram) {
    return {
      kind: "surface-thread",
      binding: {
        adapter: "telegram",
        instance: telegram[1]!,
        thread: telegram[2]!,
      },
    };
  }

  return { kind: "work" };
}

export function parseTransportBindingSpec(
  spec: string,
): ChannelTransportBinding {
  const [adapter, instance, ...threadParts] = spec.split("/");
  const thread = threadParts.join("/");
  if (!adapter || !instance || !thread) {
    throw new Error("binding must use adapter/instance/thread");
  }
  return { adapter, instance, thread };
}

export function formatTransportBinding(
  binding: ChannelTransportBinding | undefined,
): string {
  if (!binding) return "(none)";
  return `${binding.adapter}/${binding.instance}/${binding.thread}`;
}

function isChannelKind(value: unknown): value is ChannelKind {
  return value === "home" ||
    value === "surface-thread" ||
    value === "dm" ||
    value === "work";
}
