import type { JsonObject, JsonSchema } from "../json";
import type {
  CapabilityName,
  DestinationId,
  ItemId,
  PayloadTypeName,
  RoutingRecordId,
  Timestamp,
} from "./ids";
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
  readonly pointer?: string;
};
