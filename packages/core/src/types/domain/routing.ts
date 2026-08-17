import type { JsonObject, JsonSchema } from "../json";
import type { Asset } from "./asset";
import type { Artifact } from "./enrichment";
import type {
  CapabilityName,
  DestinationId,
  ItemId,
  PayloadTypeName,
  RoutingRecordId,
  SourceId,
  Timestamp,
} from "./ids";
import type { Tag } from "./item";
import type { Payload } from "./payload";

export type Capability = {
  readonly name: CapabilityName;
  readonly accepts: readonly PayloadTypeName[];
  readonly targetSchema: JsonSchema;
};

export type DestinationDescriptor = {
  readonly id: DestinationId;
  readonly capabilities: readonly Capability[];
};

/**
 * What a wired destination answered when asked. A destination that could not
 * say is reported rather than dropped: one that is missing and one that is
 * unreachable are different answers to a person looking for it.
 */
export type DestinationReport =
  | ({ readonly kind: "described" } & DestinationDescriptor)
  | {
      readonly kind: "undescribable";
      readonly id: DestinationId;
      readonly detail: string;
    };

export type DeliveryRequest = {
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly target: JsonObject;
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
  readonly target: JsonObject;
  readonly source: SourceId;
  readonly payload: Payload;
  readonly tags: readonly Tag[];
  readonly createdAt: Timestamp;
  readonly contentUpdatedAt?: Timestamp;
  readonly artifacts: readonly Artifact[];
  /** Every asset the payload and the artifacts reference, in slot order. */
  readonly assets: readonly DeliveredAsset[];
};

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
      readonly target: JsonObject;
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
