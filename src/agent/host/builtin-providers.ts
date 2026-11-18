import type { Provider } from "@earendil-works/pi-ai";

/** Pi's own providers, loaded only when they are asked for, since loading them brings in every provider's model list. */
export async function builtinProviders(): Promise<Provider[]> {
  const loaded = await import("@earendil-works/pi-ai/providers/all");
  return loaded.builtinProviders();
}
