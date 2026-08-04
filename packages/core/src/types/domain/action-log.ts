import type { JsonObject } from "../json";
import type { Agent } from "./agent";
import type { ActionId, ItemId, Timestamp } from "./ids";

export type ActionKind =
  | "captured"
  | "amended"
  | "revised"
  | "tagged"
  | "untagged"
  | "suggestion-added"
  | "suggestion-accepted"
  | "suggestion-rejected"
  | "artifact-added"
  | "artifact-corrected"
  | "archived"
  | "unarchived"
  | "routed"
  | "delivery-failed"
  | "enrichment-requested"
  | "enrichment-failed"
  | "enrichment-abandoned"
  | "assets-released"
  | "purged"
  | "actions-cleared";

export type Action = {
  readonly id: ActionId;
  readonly kind: ActionKind;
  readonly subject?: ItemId;
  readonly by: Agent;
  readonly at: Timestamp;
  readonly detail: JsonObject;
};
