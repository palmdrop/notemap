import type { JsonObject } from "../json";
import type { Agent } from "./agent";
import type { AssetRef } from "./asset";
import type { ArtifactId, EnrichmentName, ItemId, Timestamp } from "./ids";

export type FailureDetail = {
  readonly code: string;
  readonly detail: string;
};

export type EnrichmentState =
  | { readonly kind: "unavailable" }
  | { readonly kind: "not-applicable" }
  | { readonly kind: "pending" }
  | { readonly kind: "running" }
  | {
      readonly kind: "failed";
      readonly attempts: number;
      readonly lastFailure: FailureDetail;
      readonly nextAttemptAt: Timestamp;
    }
  | {
      readonly kind: "abandoned";
      readonly attempts: number;
      readonly lastFailure: FailureDetail;
    }
  | { readonly kind: "done" };

export type EnrichmentStatus = {
  readonly item: ItemId;
  readonly enrichment: EnrichmentName;
  readonly state: EnrichmentState;
};

export type Artifact = {
  readonly id: ArtifactId;
  readonly item: ItemId;
  readonly enrichment: EnrichmentName;
  readonly by: Agent;
  readonly createdAt: Timestamp;
  readonly content: JsonObject;
  readonly assets: readonly AssetRef[];
  readonly correctionOf?: ArtifactId;
};

export type ArtifactDraft = Omit<Artifact, "id" | "by" | "createdAt">;

/** Deliberately partial: what an enrichment needs, and how needs resolve, is unsettled. */
export type EnrichmentDescriptor = {
  readonly name: EnrichmentName;
  readonly appliesTo: readonly string[];
};
