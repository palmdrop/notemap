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
  | "work-failed"
  | "work-abandoned"
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

/**
 * Which entries a read of the log is about; empty is the whole log. A subject
 * the pool no longer holds is a normal thing to ask for — the log outlives the
 * material — so this narrows a read and never fails to resolve.
 */
export type ActionQuery = {
  readonly item?: ItemId;
};
