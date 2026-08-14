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

export type DeliveryRequest = {
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly target: JsonObject;
};

/**
 * One asset a delivery carries: the name it was uploaded under, and the bytes
 * behind it. Opening is lazy, so a capability that wants no bytes reads none
 * and a long recording is never buffered.
 */
export type DeliveredAsset = {
  readonly slot: string;
  readonly asset: Asset;
  open(signal?: AbortSignal): Promise<AsyncIterable<Uint8Array>>;
};

/**
 * Everything durable about an item, handed to an adapter that reaches back for
 * nothing. Not a `MirrorRecord`, although the two carry nearly the same
 * material: that one's contract is that a pool rebuilds from it, and a change
 * made to serve rebuild would otherwise reach every destination adapter.
 *
 * It carries no prior routing records — where else an item went is another
 * destination's business — and no pending suggestions, which are regenerable
 * and mean nothing undecided.
 */
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
  | {
      readonly kind: "delivered";
      readonly pointer?: string;
      readonly at: Timestamp;
    }
  | { readonly kind: "unreachable"; readonly detail: string }
  | { readonly kind: "rejected"; readonly detail: string };

export type RoutingTarget =
  | {
      readonly kind: "destination";
      readonly destination: DestinationId;
      readonly capability: CapabilityName;
      /**
       * What the capability was pointed at, in its own terms — a path, a file,
       * a board column. Remembered rather than consumed, because a delivery
       * that is still pending has to be attempted again from the record alone.
       */
      readonly target: JsonObject;
    }
  | { readonly kind: "user"; readonly note?: string };

/**
 * A record is **pending** while it is a reservation and nothing has arrived
 * anywhere. Anything else means bytes reached somewhere, which is why a
 * reservation that is abandoned or cancelled is removed rather than marked.
 */
export type RoutingRecordState = "pending" | "delivered";

export type RoutingRecord = {
  readonly id: RoutingRecordId;
  readonly item: ItemId;
  readonly target: RoutingTarget;
  readonly state: RoutingRecordState;
  readonly at: Timestamp;
  readonly pointer?: string;
};
