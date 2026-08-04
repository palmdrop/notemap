import type {
  ArtifactId,
  AssetId,
  BlobHash,
  CapabilityName,
  DestinationId,
  EnrichmentName,
  ItemId,
  LeaseId,
  PayloadTypeName,
  SchemaIssue,
  SourceId,
  SuggestionId,
  Timestamp,
} from "./ids.js";

/**
 * Every refusal names facts and never a message. Core has no locale and no
 * interface; turning these into a sentence or a status code is the host's job.
 *
 * Unions are per-operation rather than shared, so a caller's switch is
 * exhaustive over exactly what its call can produce. Some are aliases today
 * and exist so that gaining a refusal later is not a change of shape.
 */

export type SubjectRefusal =
  | { readonly kind: "no-such-item"; readonly item: ItemId }
  | {
      readonly kind: "item-purged";
      readonly item: ItemId;
      readonly at: Timestamp;
    };

export type CaptureRefusal =
  | { readonly kind: "unknown-source"; readonly source: SourceId }
  | { readonly kind: "unknown-payload-type"; readonly type: PayloadTypeName }
  | {
      readonly kind: "payload-invalid";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "missing-asset-slot"; readonly slot: string }
  | { readonly kind: "unknown-asset"; readonly asset: AssetId }
  | {
      readonly kind: "asset-hash-mismatch";
      readonly asset: AssetId;
      readonly expected: BlobHash;
      readonly actual: BlobHash;
    }
  /** Same source identity, different content: an outside edit must not rewrite pool history. */
  | { readonly kind: "source-item-changed"; readonly existing: ItemId };

export type EditRefusal =
  | SubjectRefusal
  | {
      readonly kind: "payload-invalid";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "payload-type-changed"; readonly from: PayloadTypeName };

export type TagRefusal = SubjectRefusal;

export type ArchiveRefusal = SubjectRefusal;

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

/** Knowable from declared capabilities alone, before anything is attempted. */
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
      readonly kind: "target-invalid";
      readonly issues: readonly SchemaIssue[];
    };

/** Only knowable from the adapter's answer, and worth retrying. */
export type AttemptFailure =
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "rejected-by-destination"; readonly detail: string };

export type DeliveryRefusal = PreparationRefusal | AttemptFailure;

export type RoutingRefusal = SubjectRefusal;

export type AssetRefusal =
  | { readonly kind: "no-such-asset"; readonly asset: AssetId }
  | { readonly kind: "blob-missing"; readonly blob: BlobHash }
  | { readonly kind: "blob-drifted"; readonly blob: BlobHash };

export type LeaseRefusal = {
  readonly kind: "lease-lost";
  readonly lease: LeaseId;
};

export type ActionLogRefusal = SubjectRefusal;
