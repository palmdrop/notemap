import type { JsonObject, JsonSchema } from "../json";
import type {
  CapabilityName,
  DestinationId,
  DestinationKindName,
  PayloadTypeName,
  Timestamp,
} from "./ids";

/** What core submits to be written. Excludes every field the store owns or derives. */
export type DestinationRecord = {
  readonly id: DestinationId;
  /** A person's label. Free text, and need not be unique: a record names the id. */
  readonly name: string;
  readonly kind: DestinationKindName;
  /** Opaque to core, which only checks it against the kind's schema. */
  readonly settings: JsonObject;
  /** Present means no longer offered for new routing. */
  readonly retiredAt?: Timestamp;
  readonly createdAt: Timestamp;
};

export type Destination = DestinationRecord & {
  readonly modifiedAt: Timestamp;
};

/** Core holds no list of kinds: it validates against whatever the port publishes. */
export type DestinationKind = {
  readonly name: DestinationKindName;
  readonly settingsSchema: JsonSchema;
};

export type Capability = {
  readonly name: CapabilityName;
  readonly accepts: readonly PayloadTypeName[];
  readonly targetSchema: JsonSchema;
};

export type DestinationDescriptor = {
  readonly capabilities: readonly Capability[];
};

/**
 * `undescribable` went and looked and could not say; `unusable` could not be
 * asked at all — nothing speaks its kind, or its settings no longer satisfy
 * that kind's schema.
 */
export type DestinationReport =
  | ({ readonly kind: "described" } & DestinationDescriptor)
  | { readonly kind: "undescribable"; readonly detail: string }
  | { readonly kind: "unusable"; readonly detail: string };

/** What a person supplies to create one. The id, the timestamps and retirement are not theirs. */
export type DestinationDraft = {
  readonly name: string;
  readonly kind: DestinationKindName;
  readonly settings: JsonObject;
};

/** What a person may change afterwards. The kind is not among them. */
export type DestinationChanges = {
  readonly name?: string;
  readonly settings?: JsonObject;
};
