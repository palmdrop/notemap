import type { components, paths } from "./generated";

type Verb = "get" | "post" | "put" | "delete" | "patch";
type OperationOf<T> = T extends object
  ? NonNullable<T[Extract<keyof T, Verb>]>
  : never;
type ResponsesOf<T> = T extends { responses: infer R } ? R : never;
type BodyOf<T> = T extends object ? T[keyof T] : never;
type JsonOf<T> = T extends { content: { "application/json": infer B } }
  ? B
  : never;
type CodeOf<T> = T extends { error: { code: infer C } } ? C : never;

/**
 * Every refusal `/v1` can answer with, walked out of the document rather than
 * listed by hand, so a code the daemon adds cannot go unnoticed here.
 */
export type RefusalCode = CodeOf<
  JsonOf<BodyOf<ResponsesOf<OperationOf<paths[keyof paths]>>>>
>;

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

export type EditEnvelope = components["schemas"]["EditEnvelope"];

export type Destination = components["schemas"]["Destination"];
export type DestinationKind = components["schemas"]["DestinationKind"];
export type DestinationDescription =
  components["schemas"]["DestinationDescription"];
export type CreateDestinationRequest =
  components["schemas"]["CreateDestinationRequest"];
export type UpdateDestinationRequest =
  components["schemas"]["UpdateDestinationRequest"];
export type Capability = components["schemas"]["Capability"];
export type RouteRequest = components["schemas"]["RouteRequest"];
export type RoutingRecord = components["schemas"]["RoutingRecord"];
export type RoutingSummary = components["schemas"]["RoutingSummary"];
export type TagUse = components["schemas"]["TagUse"];

export type ItemId = Item["id"];
export type AssetId = Asset["id"];
export type DestinationId = Destination["id"];
