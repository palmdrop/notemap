import type { SchemaIssue } from "../json";
import type { JobKind } from "../domain/work";
import type {
  ArtifactId,
  AssetId,
  BlobHash,
  CapabilityName,
  DestinationId,
  DestinationKindName,
  EnrichmentName,
  ItemId,
  LeaseId,
  PayloadTypeName,
  RoutingRecordId,
  SuggestionId,
  Timestamp,
} from "../domain/ids";

export type SubjectRefusal =
  | { readonly kind: "no-such-item"; readonly item: ItemId }
  | {
      readonly kind: "item-purged";
      readonly item: ItemId;
      readonly at: Timestamp;
    };

export type CaptureRefusal =
  | { readonly kind: "unknown-payload-type"; readonly type: PayloadTypeName }
  | {
      readonly kind: "payload-invalid";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "missing-asset-slot"; readonly slot: string }
  | { readonly kind: "unknown-asset"; readonly asset: AssetId }
  | { readonly kind: "capture-id-conflict"; readonly existing: ItemId }
  | { readonly kind: "source-item-changed"; readonly existing: ItemId };

/**
 * Everything a capture's payload is refused for, less `unknown-payload-type`: the
 * type an edit carries is the item's own, and one that differs is a change.
 */
export type EditRefusal =
  | SubjectRefusal
  | {
      readonly kind: "payload-invalid";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "payload-type-changed"; readonly from: PayloadTypeName }
  | { readonly kind: "missing-asset-slot"; readonly slot: string }
  | { readonly kind: "unknown-asset"; readonly asset: AssetId }
  /** The envelope's identity already names an item that is not a revision of this one. */
  | { readonly kind: "source-item-changed"; readonly existing: ItemId };

export type TagRefusal =
  SubjectRefusal | { readonly kind: "tag-invalid"; readonly tag: string };

export type ArchiveRefusal =
  | SubjectRefusal
  | {
      readonly kind: "already-archived";
      readonly item: ItemId;
      readonly at: Timestamp;
    }
  | { readonly kind: "not-archived"; readonly item: ItemId };

export type PurgeRefusal = SubjectRefusal;

export type SuggestionRefusal =
  | SubjectRefusal
  | { readonly kind: "no-such-suggestion"; readonly suggestion: SuggestionId }
  | { readonly kind: "already-decided"; readonly suggestion: SuggestionId };

export type EnrichmentRefusal =
  | SubjectRefusal
  | { readonly kind: "unknown-enrichment"; readonly enrichment: EnrichmentName }
  | { readonly kind: "no-provider"; readonly enrichment: EnrichmentName }
  | { readonly kind: "needs-unmet"; readonly enrichment: EnrichmentName };

export type ArtifactRefusal = {
  readonly kind: "no-such-artifact";
  readonly artifact: ArtifactId;
};

/** Every way a destination can be refused before anything is attempted. */
export type DestinationRefusal =
  | {
      readonly kind: "unknown-destination";
      readonly destination: DestinationId;
    }
  | {
      readonly kind: "unknown-destination-kind";
      readonly destinationKind: DestinationKindName;
    }
  | {
      readonly kind: "invalid-destination-settings";
      readonly issues: readonly SchemaIssue[];
    };

/** Retirement carries the instant it happened, which a second one would overwrite. */
export type RetireRefusal =
  | {
      readonly kind: "unknown-destination";
      readonly destination: DestinationId;
    }
  | {
      readonly kind: "already-retired";
      readonly destination: DestinationId;
      readonly at: Timestamp;
    }
  | { readonly kind: "not-retired"; readonly destination: DestinationId };

/**
 * Retiring is what removal means for a destination a record has ever named, so
 * the refusal names the destination the caller should retire instead.
 */
export type DestinationDeletionRefusal =
  | {
      readonly kind: "unknown-destination";
      readonly destination: DestinationId;
    }
  | {
      readonly kind: "destination-in-use";
      readonly destination: DestinationId;
    };

export type PreparationRefusal =
  | SubjectRefusal
  | {
      readonly kind: "unknown-destination";
      readonly destination: DestinationId;
    }
  | {
      readonly kind: "capability-undeclared";
      readonly capability: CapabilityName;
    }
  | {
      readonly kind: "payload-type-unsupported";
      readonly type: PayloadTypeName;
      readonly accepts: readonly PayloadTypeName[];
    }
  | {
      readonly kind: "arguments-invalid";
      readonly issues: readonly SchemaIssue[];
    }
  | {
      readonly kind: "destination-retired";
      readonly destination: DestinationId;
    }
  | {
      readonly kind: "destination-unusable";
      readonly destination: DestinationId;
      readonly detail: string;
    };

/**
 * `delivery-outcome-unknown` is the one a host warns on: the attempt neither
 * answered nor refused, so the material may be at the destination already.
 */
export type AttemptFailure =
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "rejected-by-destination"; readonly detail: string }
  | { readonly kind: "delivery-outcome-unknown"; readonly detail: string };

/** Whoever holds a lease may be halfway through the attempt, and its outcome is not the canceller's to decide. */
export type CancelRefusal =
  | { readonly kind: "no-such-record"; readonly record: RoutingRecordId }
  | { readonly kind: "not-pending"; readonly record: RoutingRecordId }
  | { readonly kind: "delivery-in-flight"; readonly record: RoutingRecordId };

export type DeliveryRefusal = PreparationRefusal | AttemptFailure;

export type RoutingRefusal = SubjectRefusal;

export type AssetRefusal =
  | { readonly kind: "no-such-asset"; readonly asset: AssetId }
  | { readonly kind: "blob-missing"; readonly blob: BlobHash };

/**
 * The id is the uploader's, so two uploads can claim one. Refused only where
 * they disagree: identical bytes under the same name and media type are the
 * same asset arriving twice.
 */
export type AssetStoreRefusal = {
  readonly kind: "asset-id-conflict";
  readonly asset: AssetId;
};

export type LeaseRefusal = {
  readonly kind: "lease-lost";
  readonly lease: LeaseId;
};

/**
 * `wrong-outcome` is a caller reporting something the job cannot have produced —
 * a pointer for a mirror write, artifacts for a delivery. Refused rather than
 * ignored, because the outcome that was dropped is the one the work was for.
 */
export type CompletionRefusal =
  | LeaseRefusal
  | {
      readonly kind: "wrong-outcome";
      readonly lease: LeaseId;
      readonly work: JobKind;
    };

/** Clearing refuses nothing; the result stays refusal-shaped because every mutation's is. */
export type ActionLogRefusal = never;

export type RebuildRefusal =
  | { readonly kind: "pool-not-empty" }
  | { readonly kind: "mirror-unreadable"; readonly detail: string };
