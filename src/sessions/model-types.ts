import type { Api, Model } from "@earendil-works/pi-ai";
import type { ModelRef } from "../config/model.js";

export type ModelPolicySource = "cli-policy" | "agent" | "default";
export type ModelResolutionSource =
  | "cli"
  | "policy"
  | "registry-fallback"
  | "saved-session"
  | "session-switch"
  | "missing";

export interface ModelPolicyCandidateResolution extends ModelRef {
  usable: boolean;
  selected?: boolean;
  reason?: string;
}

export interface ModelPolicyResolution {
  name: string;
  source: ModelPolicySource;
  candidates: ModelPolicyCandidateResolution[];
  selected?: ModelRef;
  problems: string[];
}

export interface ModelResolution {
  source: ModelResolutionSource;
  model?: Model<Api>;
  modelRef?: ModelRef;
  policy?: ModelPolicyResolution;
  problems: string[];
}

export interface SessionModelRequest {
  provider?: string;
  model?: string;
  modelPolicy?: string;
  defaultModelPolicy?: string;
  allowMissingModel?: boolean;
  allowRegistryFallbackModel?: boolean;
  missingMessage?: string;
}
