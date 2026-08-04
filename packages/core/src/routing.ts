import type {
  CapabilityName,
  DestinationId,
  ItemId,
  JsonObject,
  JsonSchema,
  PayloadTypeName,
  RoutingRecordId,
  Timestamp,
} from "./ids.js";
import type { Payload } from "./payload.js";

/**
 * Adapters name their own capabilities. A fixed set of verbs was tried and
 * rejected as filesystem-shaped: a board, a webhook and a Micropub endpoint
 * do not decompose into create, append and place.
 */
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

/** What an adapter is handed once core has checked it against the capability. */
export type Delivery = {
  readonly item: ItemId;
  readonly destination: DestinationId;
  readonly capability: CapabilityName;
  readonly target: JsonObject;
  readonly payload: Payload;
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
    }
  | { readonly kind: "user"; readonly note?: string };

export type RoutingRecord = {
  readonly id: RoutingRecordId;
  readonly item: ItemId;
  readonly target: RoutingTarget;
  readonly at: Timestamp;

  /** Where it landed when the delivery happened, not a promise about now. */
  readonly pointer?: string;
};
