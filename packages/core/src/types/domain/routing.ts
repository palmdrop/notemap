import type { JsonObject } from "../json";
import type { Asset } from "./asset";
import type { Destination } from "./destination";
import type { Artifact } from "./enrichment";
import type {
  BlobHash,
  CapabilityName,
  DestinationId,
  ItemId,
  RoutingRecordId,
  RoutingTemplateId,
  SourceId,
  Timestamp,
} from "./ids";
import type { Tag } from "./item";
import type { Payload } from "./payload";

export type DeliveryRequest = {
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly arguments: JsonObject;
};

/** Opening is lazy, so a capability that wants no bytes reads none and a long recording is never buffered. */
export type DeliveredAsset = {
  readonly slot: string;
  readonly asset: Asset;
  open(signal?: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
};

/** Everything durable about an item, handed to an adapter that reaches back for nothing. */
export type Delivery = {
  readonly item: ItemId;
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly arguments: JsonObject;
  readonly source: SourceId;
  readonly payload: Payload;
  readonly tags: readonly Tag[];
  readonly createdAt: Timestamp;
  readonly contentUpdatedAt?: Timestamp;
  readonly artifacts: readonly Artifact[];
  /** Every asset the payload and the artifacts reference, in slot order. */
  readonly assets: readonly DeliveredAsset[];
};

/**
 * What a deferred delivery finds when it goes to carry out a reservation: the
 * destination as it now is, so a root corrected after a failure is why the
 * retry succeeds. Unusable is proof that nothing was delivered.
 */
export type AttemptableDelivery =
  | {
      readonly kind: "ready";
      readonly destination: Destination;
      readonly delivery: Delivery;
    }
  | { readonly kind: "unusable"; readonly detail: string };

/** Opened lazily, as `DeliveredAsset` is, so a large output is never buffered to be hashed. */
export type DeliveredContent = {
  readonly mediaType: string;
  open(signal?: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
};

/**
 * Both halves optional and independent: a destination may have nothing worth
 * keeping and still have something to say about what it could not carry.
 */
export type DeliveredOutput = {
  readonly content?: DeliveredContent;
  /** Free prose. Nothing parses it, on a failure `detail`'s own terms. */
  readonly note?: string;
};

/** The same content once core has stored it: the store is content-addressed, so the record names a hash. */
export type StoredContent = {
  readonly blob: BlobHash;
  readonly mediaType: string;
};

export type StoredOutput = {
  readonly content?: StoredContent;
  readonly note?: string;
};

/**
 * A delivery may convert lossily and still have delivered: `rejected` is for a
 * capture the destination can make no sense of, not for one it carried in part.
 */
export type DeliveryOutcome =
  | {
      readonly kind: "delivered";
      readonly pointer?: string;
      readonly url?: string;
      readonly output?: DeliveredOutput;
    }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "rejected"; readonly detail: string };

/** An output's bytes, opened, with what they are and the blob that answers an ETag. */
export type OpenedOutput = {
  readonly blob: BlobHash;
  readonly mediaType: string;
  readonly bytes: AsyncIterable<Uint8Array>;
};

/**
 * What a destination says it would write. Indicative and never binding: the
 * delivery converts again when it runs. None of the three failures stops the
 * decision being made — only the seeing of it.
 */
export type PreviewReport =
  | ({ readonly kind: "previewed" } & DeliveredOutput)
  | { readonly kind: "rejected"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "not-offered" };

/** What a delivery that landed adds to the reservation it resolves. */
export type DeliveryLanding = {
  readonly pointer?: string;
  readonly url?: string;
  readonly output?: StoredOutput;
};

export type RoutingTarget =
  | {
      readonly kind: "destination";
      readonly destination: DestinationId;
      readonly capability: CapabilityName;
      /**
       * A path, a file, a board column. Remembered rather than consumed,
       * because a pending delivery is attempted again from the record alone.
       */
      readonly arguments: JsonObject;
    }
  | { readonly kind: "user"; readonly note?: string };

/** There is no abandoned state: a reservation that never landed is removed rather than marked. */
export type RoutingRecordState = "pending" | "delivered";

/**
 * Where a decision came from a routing template, and whether the tag applied it.
 * The log wants the difference — a template filed this, against somebody took
 * one — and `establish` wants to know whether it has ever landed. Giving the
 * tag back no longer reads it: a reservation any template made takes that
 * template's tag with it.
 */
export type AppliedTemplate = {
  readonly template: RoutingTemplateId;
  readonly firedByTag: boolean;
};

export type RoutingRecord = {
  readonly id: RoutingRecordId;
  readonly item: ItemId;
  readonly target: RoutingTarget;
  readonly state: RoutingRecordState;
  readonly at: Timestamp;
  /** Absent where the decision was made by hand. */
  readonly applied?: AppliedTemplate;
  readonly pointer?: string;
  /** A link to what the pointer names, where the destination could offer one. */
  readonly url?: string;
  /** What the delivery produced. Only a delivered record ever carries one. */
  readonly output?: StoredOutput;
};

/**
 * What one argument field of one capability has already held on a destination,
 * asked the way `candidates` is and answered from the other side: the vault
 * says what it offers, the pool says what has been used. A place in one
 * destination means nothing in another, so this is never pool-wide.
 */
export type RememberedRequest = {
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly field: string;
};

/**
 * Facts, not an order. How often and how recently are what the pool knows;
 * which of them to put first is presentation, and belongs to whatever draws it
 * — so changing between most-used and most-recent stays a surface's change.
 */
export type RememberedPlace = {
  readonly value: string;
  readonly uses: number;
  readonly lastAt: Timestamp;
};

export type RememberedAnswer = {
  readonly places: readonly RememberedPlace[];
  /** True where the pool held more than it answered, on `candidates`' own terms. */
  readonly truncated: boolean;
};
