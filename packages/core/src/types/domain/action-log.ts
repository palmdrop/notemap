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
  | "delivery-cancelled"
  | "destination-created"
  | "destination-renamed"
  | "destination-reconfigured"
  | "destination-retired"
  | "destination-unretired"
  | "destination-deleted"
  | "enrichment-requested"
  | "work-failed"
  | "work-abandoned"
  | "assets-released"
  | "purged"
  | "actions-cleared";

export type Action = {
  readonly id: ActionId;
  readonly kind: ActionKind;
  /** Absent for work that is not about an item — a destination names itself in `detail`. */
  readonly subject?: ItemId;
  readonly by: Agent;
  readonly at: Timestamp;
  readonly detail: JsonObject;
};

export type ActionQuery = {
  readonly item?: ItemId;
};
