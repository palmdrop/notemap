import type { components } from "./generated";

export type Item = components["schemas"]["Item"];
export type ItemSlice = components["schemas"]["ItemSlice"];
export type Payload = Item["payload"];
export type Tag = NonNullable<Item["tags"]>[number];

export type Asset = components["schemas"]["Asset"];
type WireCaptureEnvelope = components["schemas"]["CaptureEnvelope"];

/**
 * The pool will mint an id for an envelope without one; a client never lets it,
 * because an outbox operation has to name the item it is about before the pool
 * has answered.
 */
export type CaptureEnvelope = WireCaptureEnvelope & {
  readonly id: NonNullable<WireCaptureEnvelope["id"]>;
};
export type CaptureOutcome = components["schemas"]["CaptureOutcome"];

export type Destination = components["schemas"]["Destination"];
export type Capability = components["schemas"]["Capability"];
export type RouteRequest = components["schemas"]["RouteRequest"];
export type RoutingRecord = components["schemas"]["RoutingRecord"];

export type ItemId = Item["id"];
export type AssetId = Asset["id"];
