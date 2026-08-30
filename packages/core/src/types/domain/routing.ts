import type { JsonObject } from "../json";
import type { Asset } from "./asset";
import type { Destination } from "./destination";
import type { Artifact } from "./enrichment";
import type {
  CapabilityName,
  DestinationId,
  ItemId,
  RoutingRecordId,
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

export type DeliveryOutcome =
  | { readonly kind: "delivered"; readonly pointer?: string }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "rejected"; readonly detail: string };

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

export type RoutingRecord = {
  readonly id: RoutingRecordId;
  readonly item: ItemId;
  readonly target: RoutingTarget;
  readonly state: RoutingRecordState;
  readonly at: Timestamp;
  readonly pointer?: string;
};
