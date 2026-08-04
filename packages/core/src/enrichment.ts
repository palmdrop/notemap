import type { Agent } from "./agent.js";
import type { AssetRef } from "./asset.js";
import type {
  ArtifactId,
  EnrichmentName,
  ItemId,
  JsonObject,
  Timestamp,
} from "./ids.js";

export type FailureDetail = {
  readonly code: string;
  readonly detail: string;
};

/**
 * `failed` and `abandoned` differ only in whether anything further will
 * happen unasked. Without that split an item could never answer "is anything
 * still coming?", which every other state exists to make answerable.
 */
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

  /** A correction is an artifact of its own; both it and the original are kept. */
  readonly correctionOf?: ArtifactId;
};
